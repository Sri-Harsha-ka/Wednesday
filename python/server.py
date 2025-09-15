from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import requests
import whisper
try:
    from faster_whisper import WhisperModel
    HAVE_FAST_WHISPER = True
except Exception:
    WhisperModel = None
    HAVE_FAST_WHISPER = False
import logging
import json
import platform
import subprocess
import webbrowser
import re
import time
import concurrent.futures

# optional: screenshot
try:
    import pyautogui
except Exception:
    pyautogui = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__)
CORS(app)

# Configuration
MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama2")

# Device / executor setup for faster transcription
try:
    import torch
    CUDA_AVAILABLE = torch.cuda.is_available()
except Exception:
    CUDA_AVAILABLE = False

EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get("WHISPER_MAX_WORKERS", "2")))

device = "cuda" if CUDA_AVAILABLE else "cpu"
logging.info(f"Loading Whisper model: {MODEL_NAME} on device={device} (CUDA_AVAILABLE={CUDA_AVAILABLE})")
try:
    model = whisper.load_model(MODEL_NAME, device=device)
except Exception:
    logging.exception("Failed to load model with device hint; falling back to default load")
    model = whisper.load_model(MODEL_NAME)

# faster-whisper: lazy-loaded model holder
_fw_model = None
FAST_WHISPER_MODEL = os.environ.get("FAST_WHISPER_MODEL", f"openai/whisper-{MODEL_NAME}")

def get_faster_whisper_model():
    """Lazily load faster-whisper model if available."""
    global _fw_model
    if not HAVE_FAST_WHISPER:
        return None
    if _fw_model is not None:
        return _fw_model

    # device and compute_type selection
    fw_device = "cuda" if CUDA_AVAILABLE else "cpu"
    if fw_device == "cuda":
        compute_type = "float16"
    else:
        # try an int8 quantized compute type for CPU; fallback to float32 if it errors
        compute_type = os.environ.get("FAST_WHISPER_COMPUTE", "int8_float16")

    logging.info(f"Loading faster-whisper model {FAST_WHISPER_MODEL} on {fw_device} compute_type={compute_type}")
    try:
        _fw_model = WhisperModel(FAST_WHISPER_MODEL, device=fw_device, compute_type=compute_type)
    except Exception:
        logging.exception("Failed to load faster-whisper with requested compute_type; retrying with float32")
        try:
            _fw_model = WhisperModel(FAST_WHISPER_MODEL, device=fw_device, compute_type="float32")
        except Exception:
            logging.exception("faster-whisper model failed to load; disabling faster-whisper")
            _fw_model = None
    return _fw_model


def transcribe_with_faster_whisper(audio_path: str, beam_size: int = 1) -> str:
    """Transcribe using faster-whisper if available. Returns the transcript string."""
    model_fw = get_faster_whisper_model()
    if model_fw is None:
        raise RuntimeError("faster-whisper not available")

    segments, info = model_fw.transcribe(audio_path, beam_size=beam_size)
    parts = []
    for seg in segments:
        # seg may be an object with .text or a tuple/list
        try:
            parts.append(seg.text)
        except Exception:
            if isinstance(seg, (list, tuple)) and len(seg) > 0:
                parts.append(str(seg[0]))
    return " ".join(p.strip() for p in parts if p)


def transcribe_audio(audio_path: str) -> str:
    """Generic transcription wrapper: prefer faster-whisper, fall back to whisper."""
    # Try faster-whisper first
    if HAVE_FAST_WHISPER:
        try:
            # beam_size=1 for low-latency; adjust via env var
            beam = int(os.environ.get("FAST_WHISPER_BEAM", "1"))
            return transcribe_with_faster_whisper(audio_path, beam_size=beam)
        except Exception:
            logging.exception("faster-whisper transcription failed; falling back to whisper")

    # Fallback: use the whisper package already loaded as `model`
    try:
        res = model.transcribe(audio_path)
        return res.get("text", "").strip()
    except Exception:
        logging.exception("whisper.transcribe failed")
        return ""


def ask_ollama(question: str) -> str:
    """Send a prompt to Ollama and return a best-effort text answer.

    This function is defensive: it handles proper JSON responses, NDJSON/streaming
    (one JSON object per line), and plain text fallbacks.
    """
    if not OLLAMA_HOST:
        logging.info("OLLAMA_HOST not configured, skipping Ollama call")
        return ""

    url = f"{OLLAMA_HOST}/api/generate"
    payload = {
        "model": OLLAMA_MODEL,
        "prompt": f"You are a helpful assistant. Answer concisely:\n\n{question}"
    }

    try:
        res = requests.post(url, json=payload, timeout=60)
        res.raise_for_status()

        # First try: parse as JSON (most common)
        try:
            data = res.json()
        except Exception:
            # Fallback: Ollama might return streaming, NDJSON, or concatenated JSON blobs.
            text = res.text or ""
            logging.info("Ollama returned non-JSON or streaming response; attempting fallback parsing")

            parts = []

            # Strategy 1: attempt NDJSON / line-delimited JSON
            for line in text.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        # extract common fields
                        if "response" in obj:
                            parts.append(obj.get("response", ""))
                        elif "content" in obj:
                            parts.append(obj.get("content", ""))
                        elif "text" in obj:
                            parts.append(obj.get("text", ""))
                        elif "output" in obj:
                            out = obj.get("output")
                            parts.append("".join(out) if isinstance(out, list) else str(out))
                        else:
                            parts.append(json.dumps(obj))
                    else:
                        parts.append(str(obj))
                except Exception:
                    # not a JSON line; continue to raw parsing step
                    pass

            if parts:
                joined = "".join(parts).strip()
                if joined:
                    return joined

            # Strategy 2: handle concatenated JSON objects without newlines
            # e.g. {...}{...}{...}
            decoder = json.JSONDecoder()
            s = text.strip()
            idx = 0
            decoded_any = False
            try:
                while idx < len(s):
                    s = s[idx:].lstrip()
                    if not s:
                        break
                    obj, used = decoder.raw_decode(s)
                    decoded_any = True
                    idx = used
                    # extract fields from obj
                    if isinstance(obj, dict):
                        if "response" in obj:
                            parts.append(obj.get("response", ""))
                        elif "content" in obj:
                            parts.append(obj.get("content", ""))
                        elif "text" in obj:
                            parts.append(obj.get("text", ""))
                        elif "output" in obj:
                            out = obj.get("output")
                            parts.append("".join(out) if isinstance(out, list) else str(out))
                        else:
                            parts.append(json.dumps(obj))
                    else:
                        parts.append(str(obj))
                if decoded_any and parts:
                    return "".join(parts).strip()
            except Exception:
                # raw_decode failed; fall back to returning the raw text
                logging.debug("concatenated JSON raw_decode failed; returning raw text")

            # Final fallback: return raw text
            return text.strip()

        # If we got a parsed JSON object, handle common ollama shapes
        if isinstance(data, dict):
            # case: { results: [{content: "..."}, ...] }
            if "results" in data and isinstance(data["results"], list):
                return "".join([r.get("content", "") for r in data["results"]])
            # case: { output: ["..." ] } or { output: "..." }
            if "output" in data:
                out = data["output"]
                if isinstance(out, list):
                    return "".join(out)
                return str(out)
            # case: { response: "..." }
            if "response" in data:
                return str(data["response"])
            # case: { text: "..." }
            if "text" in data:
                return str(data["text"])
            # case: { choices: [ { text: ... } ] }
            if "choices" in data and isinstance(data["choices"], list):
                return "".join([c.get("text", "") for c in data["choices"]])

        # Last resort: stringify whatever was returned
        return str(data)

    except Exception as e:
        logging.exception("Ollama request failed")
        return f"Ollama error: {e}"


# ------------------ Voice command helpers (from server_voice.py) ------------------
APP_MAP = {
    "Windows": {
        "chrome": r"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "notepad": "notepad.exe",
        "calculator": "calc.exe",
    },
    "Darwin": {
        "chrome": "Google Chrome",
        "vscode": "Visual Studio Code",
    },
    "Linux": {
        "chrome": "google-chrome",
        "vscode": "code",
    },
}


def system_name():
    return platform.system()


def open_url(url: str):
    if not re.match(r"https?://", url):
        url = "https://" + url
    webbrowser.open(url)
    return True, f"Opened {url}"


def open_application(name: str):
    sysname = system_name()
    mapping = APP_MAP.get(sysname, {})
    name = name.strip().lower()

    if name in mapping:
        path = os.path.expandvars(mapping[name])
        try:
            subprocess.Popen([path])
            return True, f"Opening {name}"
        except Exception as e:
            return False, str(e)

    return False, f"App {name} not found"


def take_screenshot():
    if pyautogui is None:
        return False, "Screenshot feature not available"
    try:
        img = pyautogui.screenshot()
        fname = f"screenshot_{int(time.time())}.png"
        img.save(fname)
        return True, f"Screenshot saved to {fname}"
    except Exception as e:
        return False, str(e)


def parse_and_execute(text: str):
    text = (text or "").lower().strip()

    if "screenshot" in text:
        return take_screenshot()

    if text.startswith("open "):
        target = text.replace("open ", "").strip()

        # Websites
        if "youtube" in target:
            return open_url("https://youtube.com")
        if "google" in target:
            return open_url("https://google.com")

        # Direct URL
        if "." in target:
            return open_url(target)

        # Apps
        return open_application(target)

    return False, "Command not recognized"

# Flask endpoint for voice command execution (merged from server_voice.py)
@app.route("/api/execute", methods=["POST"])
def execute_command():
    try:
        data = request.get_json(force=False, silent=True) or {}
        text = data.get("text") or data.get("command") or ""
        ok, msg = parse_and_execute(text)
        return jsonify({"ok": ok, "message": msg})
    except Exception as e:
        logging.exception("execute_command error")
        return jsonify({"ok": False, "message": str(e)}), 500

# ------------------ End voice helpers ------------------


@app.route("/transcribe", methods=["POST"])
def transcribe():
    logging.info("Received /transcribe request")
    logging.info(f"Headers: {dict(request.headers)}")
    logging.info(f"Content-Length: {request.content_length}")

    tmp_path = None
    try:
        if "file" in request.files:
            f = request.files["file"]
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
            tmp_path = tmp.name
            f.save(tmp_path)
            tmp.close()
            logging.info(f"Saved uploaded file from form to {tmp_path}")
        else:
            body = request.get_data()
            if not body or len(body) == 0:
                logging.warning("No file field and empty body")
                return jsonify({"error": "no file provided"}), 400
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
            tmp_path = tmp.name
            with open(tmp_path, "wb") as wf:
                wf.write(body)
            logging.info(f"Saved raw body to {tmp_path} size={os.path.getsize(tmp_path)}")

        size = os.path.getsize(tmp_path)
        logging.info(f"Uploaded file size: {size} bytes")
        # lower threshold to allow short recordings; still reject obviously empty files
        if size < 50:
            logging.warning("Uploaded file too small to contain speech")
            return jsonify({"error": "uploaded file is too small or empty"}), 400
        logging.info("Starting transcription (faster-whisper preferred)")
        transcript = transcribe_audio(tmp_path)
        logging.info(f"Transcript: {transcript!r}")

        if not transcript:
            return jsonify({"error": "no speech detected"}), 400

        # Check if transcript looks like a local command (e.g., "open youtube")
        try:
            cmd_ok, cmd_msg = parse_and_execute(transcript)
        except Exception:
            cmd_ok, cmd_msg = False, "Command parsing failed"

        # If parse_and_execute recognized the command, return its result immediately
        if cmd_ok or (isinstance(cmd_msg, str) and cmd_msg != "Command not recognized"):
            logging.info(f"Executed command from transcript: ok={cmd_ok} msg={cmd_msg}")
            return jsonify({"text": str(cmd_msg), "question": transcript, "command_executed": True}), 200

        # Otherwise fall back to LLM processing
        answer = ask_ollama(transcript)
        logging.info(f"Ollama answer: {answer!r}")
        return jsonify({"text": answer, "question": transcript}), 200
    except Exception as exc:
        logging.exception("transcribe handler error")
        return jsonify({"error": str(exc)}), 500
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
        except Exception:
            logging.exception("failed to delete tmp file")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)