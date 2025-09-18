
from flask import Flask, request, jsonify
import subprocess
import os

app = Flask(__name__)

APP_COMMANDS = {
    # System utilities (these usually work as-is)
    "notepad": "notepad.exe",
    "calculator": "calc.exe",
    "calc": "calc.exe",
    "paint": "mspaint.exe",
    "command prompt": "cmd.exe",
    "cmd": "cmd.exe",
    "explorer": "explorer.exe",
    "file": "explorer.exe",
    "files": "explorer.exe",
    "file explorer": "explorer.exe",
    "snipping tool": "SnippingTool.exe",
    "task manager": "taskmgr.exe",

    # Browsers - using shell commands for better compatibility
    "chrome": "chrome",
    "google chrome": "chrome", 
    "brave": "brave",
    "edge": "msedge",
    "microsoft edge": "msedge",
    "firefox": "firefox",
    "browser": "msedge",  # Default browser

    # Editors
    "vs code": "code",
    "visual studio code": "code",
    "code": "code",
    "sublime text": r"C:\\Program Files\\Sublime Text\\sublime_text.exe",
    "notepad++": r"C:\\Program Files\\Notepad++\\notepad++.exe",

    # Microsoft Office (using shell commands for better compatibility)
    "word": "winword",
    "microsoft word": "winword", 
    "excel": "excel",
    "microsoft excel": "excel",
    "powerpoint": "powerpnt",
    "microsoft powerpoint": "powerpnt",

    # Media
    "vlc": r"C:\\Program Files\\VideoLAN\\VLC\\vlc.exe",
    "windows media player": r"C:\\Program Files\\Windows Media Player\\wmplayer.exe",
    "spotify": r"C:\\Users\\vinee\\AppData\\Roaming\\Spotify\\Spotify.exe",
}


# Removed redundant /open_app route - all app launching now handled by /api/execute

# ...existing code...
import warnings
warnings.filterwarnings("ignore", message="pkg_resources is deprecated")

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
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3:latest")


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

# --- Helper: Convert webm to wav for Whisper compatibility ---
def convert_webm_to_wav(webm_path):
    """Convert a .webm file to .wav using ffmpeg. Returns wav path or None on failure."""
    wav_path = webm_path.replace('.webm', '.wav')
    # Enhanced ffmpeg command with noise reduction and audio enhancement
    cmd = [
        'ffmpeg', '-y', '-i', webm_path,
        # Audio preprocessing for better speech recognition
        '-af', 'highpass=f=200,lowpass=f=3000,volume=1.5,dynaudnorm=f=75:g=25:p=0.95',
        # highpass=200Hz removes low-frequency noise
        # lowpass=3000Hz removes high-frequency noise (speech is typically 300-3400Hz)
        # volume=1.5 increases gain
        # dynaudnorm normalizes audio levels
        '-ar', '16000',  # 16kHz sample rate optimal for speech
        '-ac', '1',      # Mono channel
        '-acodec', 'pcm_s16le',  # 16-bit PCM encoding
        '-f', 'wav',     # WAV format
        wav_path
    ]
    try:
        logging.info(f"Converting {webm_path} to {wav_path} using ffmpeg")
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        
        # Log ffmpeg output for debugging
        if result.stderr:
            logging.debug(f"ffmpeg stderr: {result.stderr}")
        
        # Verify the output file was created and has content
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:  # WAV header is 44 bytes
            logging.info(f"Successfully converted to {wav_path} (size: {os.path.getsize(wav_path)} bytes)")
            return wav_path
        else:
            logging.error(f"ffmpeg produced empty or missing output file: {wav_path}")
            return None
    except subprocess.CalledProcessError as e:
        logging.error(f"ffmpeg conversion failed with return code {e.returncode}")
        logging.error(f"ffmpeg stderr: {e.stderr}")
        return None
    except Exception as e:
        logging.error(f"ffmpeg conversion failed: {e}")
        return None

def validate_audio_file(file_path):
    """Validate that the audio file exists and has reasonable content."""
    if not os.path.exists(file_path):
        return False, "File does not exist"
    
    file_size = os.path.getsize(file_path)
    if file_size < 100:  # Less than 100 bytes is likely empty
        return False, f"File too small ({file_size} bytes)"
    
    # Try to read the first few bytes to ensure it's not corrupted
    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
            if len(header) < 16:
                return False, "File header too short"
    except Exception as e:
        return False, f"Cannot read file: {e}"
    
    return True, "Valid"

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
        # Use float32 for CPU as int8_float16 often causes issues
        compute_type = os.environ.get("FAST_WHISPER_COMPUTE", "float32")

    logging.info(f"Loading faster-whisper model {FAST_WHISPER_MODEL} on {fw_device} compute_type={compute_type}")
    try:
        # Try to clear any cached model that might be corrupted
        import shutil
        cache_dir = os.path.expanduser("~/.cache/huggingface/hub")
        model_cache_path = os.path.join(cache_dir, f"models--openai--whisper-{MODEL_NAME}")
        
        _fw_model = WhisperModel(FAST_WHISPER_MODEL, device=fw_device, compute_type=compute_type)
        logging.info("Successfully loaded faster-whisper model")
    except Exception as e:
        logging.exception("Failed to load faster-whisper with requested compute_type; retrying with float32")
        try:
            _fw_model = WhisperModel(FAST_WHISPER_MODEL, device=fw_device, compute_type="float32")
            logging.info("Successfully loaded faster-whisper model with float32")
        except Exception as e2:
            logging.exception("faster-whisper model failed to load; disabling faster-whisper")
            # Clear corrupted cache if it exists
            try:
                if os.path.exists(model_cache_path):
                    logging.info(f"Clearing potentially corrupted cache at {model_cache_path}")
                    shutil.rmtree(model_cache_path)
            except Exception:
                pass
            _fw_model = None
    return _fw_model


def transcribe_with_faster_whisper(audio_path: str, beam_size: int = 1) -> str:
    """Transcribe using faster-whisper with enhanced noise handling."""
    model_fw = get_faster_whisper_model()
    if model_fw is None:
        raise RuntimeError("faster-whisper not available")

    # Enhanced transcription with noise handling options
    segments, info = model_fw.transcribe(
        audio_path, 
        beam_size=beam_size,
        language="en",  # Force English for consistency
        condition_on_previous_text=False,  # Don't use previous context
        temperature=0.0,  # More deterministic output
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        initial_prompt="Please transcribe clearly spoken English voice commands."
    )
    
    parts = []
    total_confidence = 0.0
    segment_count = 0
    
    for seg in segments:
        # seg may be an object with .text or a tuple/list
        try:
            text = seg.text.strip()
            if text:
                parts.append(text)
                # Track confidence if available
                if hasattr(seg, 'avg_logprob'):
                    total_confidence += seg.avg_logprob
                    segment_count += 1
        except Exception:
            if isinstance(seg, (list, tuple)) and len(seg) > 0:
                text = str(seg[0]).strip()
                if text:
                    parts.append(text)
    
    full_text = " ".join(parts)
    
    # Quality checks for noisy environments
    if full_text:
        words = full_text.lower().split()
        
        # Check minimum length
        if len(words) < 2 and len(full_text) < 5:
            logging.warning(f"faster-whisper transcript too short: '{full_text}'")
            return ""
        
        # Check for repetitive patterns (common with noise)
        if len(words) > 2:
            unique_words = len(set(words))
            repetition_ratio = unique_words / len(words)
            if repetition_ratio < 0.3:
                logging.warning(f"faster-whisper high repetition: {repetition_ratio:.2f}")
                return ""
        
        avg_confidence = total_confidence / segment_count if segment_count > 0 else 0.0
        logging.info(f"faster-whisper quality: '{full_text}' (conf: {avg_confidence:.3f})")
    
    return full_text


def transcribe_audio(audio_path: str) -> str:
    """Generic transcription wrapper: prefer faster-whisper, fall back to whisper."""
    # Validate audio file first
    is_valid, msg = validate_audio_file(audio_path)
    if not is_valid:
        logging.error(f"Audio validation failed: {msg}")
        return ""
    
    logging.info(f"Attempting transcription of {audio_path} (size: {os.path.getsize(audio_path)} bytes)")
    
    # Try faster-whisper first
    if HAVE_FAST_WHISPER:
        try:
            # beam_size=1 for low-latency; adjust via env var
            beam = int(os.environ.get("FAST_WHISPER_BEAM", "1"))
            logging.info("Attempting faster-whisper transcription")
            result = transcribe_with_faster_whisper(audio_path, beam_size=beam)
            if result and result.strip():
                logging.info(f"faster-whisper succeeded: {result[:50]}...")
                return result
            else:
                logging.warning("faster-whisper returned empty result")
        except Exception:
            logging.exception("faster-whisper transcription failed; falling back to whisper")

    # Fallback: use the whisper package already loaded as `model`
    try:
        logging.info("Attempting regular whisper transcription with enhanced options")
        # Enhanced whisper options for better noise handling
        res = model.transcribe(
            audio_path,
            language="en",  # Force English for better accuracy
            task="transcribe",
            verbose=False,
            word_timestamps=True,  # Enable to get confidence info
            # Audio preprocessing options
            condition_on_previous_text=False,  # Don't use previous context
            temperature=0.0,  # More deterministic output
            compression_ratio_threshold=2.4,  # Detect repetitive content
            logprob_threshold=-1.0,  # Confidence threshold
            no_speech_threshold=0.6,  # Higher threshold for no speech detection
        )
        
        text = res.get("text", "").strip()
        
        # Calculate average confidence from word-level data if available
        confidence = 0.0
        if "segments" in res and res["segments"]:
            total_logprob = 0.0
            total_words = 0
            for segment in res["segments"]:
                if "words" in segment:
                    for word in segment["words"]:
                        if "probability" in word:
                            total_logprob += word["probability"]
                            total_words += 1
            if total_words > 0:
                confidence = total_logprob / total_words
        
        # Additional quality checks for noisy environments
        if text:
            # Check for repetitive patterns (common in noise)
            words = text.lower().split()
            if len(words) > 2:
                # Check for excessive repetition
                unique_words = len(set(words))
                repetition_ratio = unique_words / len(words)
                if repetition_ratio < 0.3:  # Too much repetition
                    logging.warning(f"High repetition detected: {repetition_ratio:.2f}")
                    return ""
            
            # Check for minimum meaningful length
            if len(words) < 2 and len(text) < 5:
                logging.warning(f"Transcript too short to be meaningful: '{text}'")
                return ""
            
            logging.info(f"Whisper succeeded: '{text}' (confidence: {confidence:.3f})")
        else:
            logging.warning("Whisper returned empty transcript")
            logging.info(f"Full whisper result: {res}")
            
        return text
    except Exception as e:
        logging.exception("whisper.transcribe failed")
        # Check if it's the tensor reshape error specifically
        if "cannot reshape tensor" in str(e) or "0 elements" in str(e):
            logging.error("Tensor reshape error - likely empty or corrupted audio")
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
        if res.status_code == 404:
            logging.error("Ollama API returned 404 Not Found. Ollama server may not be running or the endpoint is incorrect.")
            return "[Ollama not available: 404 Not Found]"
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
        return "[Ollama error: {}]".format(e)





@app.route("/transcribe", methods=["POST"])
def transcribe():
    logging.info("=" * 60)
    logging.info("Received /transcribe request")
    logging.info(f"Headers: {dict(request.headers)}")
    logging.info(f"Content-Length: {request.content_length}")
    logging.info(f"Content-Type: {request.content_type}")
    logging.info(f"Method: {request.method}")
    logging.info(f"Remote address: {request.remote_addr}")

    tmp_path = None
    try:
        if "file" in request.files:
            f = request.files["file"]
            logging.info(f"File field found: filename={f.filename}, content_type={f.content_type}")
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
            tmp_path = tmp.name
            f.save(tmp_path)
            tmp.close()
            logging.info(f"Saved uploaded file from form to {tmp_path}")
        else:
            body = request.get_data()
            logging.info(f"No file field, reading raw body. Body length: {len(body) if body else 0}")
            if not body or len(body) == 0:
                logging.warning("No file field and empty body")
                return jsonify({"error": "no file provided"}), 400
            
            # Log first few bytes to see what we're getting
            logging.info(f"First 50 bytes of body: {body[:50]}")
            
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".webm")
            tmp_path = tmp.name
            with open(tmp_path, "wb") as wf:
                wf.write(body)
            logging.info(f"Saved raw body to {tmp_path} size={os.path.getsize(tmp_path)}")

        size = os.path.getsize(tmp_path)
        logging.info(f"Uploaded file size: {size} bytes")
        
        # Try to identify the file type
        with open(tmp_path, 'rb') as f:
            header = f.read(16)
            logging.info(f"File header (hex): {header.hex()}")
            logging.info(f"File header (first 16 bytes): {header}")
        # lower threshold to allow short recordings; still reject obviously empty files
        if size < 100:
            logging.warning("Uploaded file too small to contain speech")
            return jsonify({"error": "uploaded file is too small or empty"}), 400

        # Validate the uploaded file
        is_valid, validation_msg = validate_audio_file(tmp_path)
        if not is_valid:
            logging.error(f"Audio file validation failed: {validation_msg}")
            return jsonify({"error": f"invalid audio file: {validation_msg}"}), 400

        logging.info("Starting transcription (faster-whisper preferred)")
        
        # --- Convert webm to wav for Whisper compatibility ---
        logging.info("Attempting audio conversion with ffmpeg...")
        wav_path = convert_webm_to_wav(tmp_path)
        if wav_path and os.path.exists(wav_path):
            wav_size = os.path.getsize(wav_path)
            logging.info(f"Successfully converted {tmp_path} to {wav_path} (size: {wav_size} bytes)")
            transcript = transcribe_audio(wav_path)
        else:
            logging.warning("ffmpeg conversion failed or wav not found; using original file")
            transcript = transcribe_audio(tmp_path)
        
        logging.info(f"Final transcript result: '{transcript}' (length: {len(transcript) if transcript else 0})")

        if not transcript or transcript.strip() == "":
            logging.error("TRANSCRIPTION FAILED: Empty transcript returned")
            logging.error(f"Original file: {tmp_path} ({size} bytes)")
            if wav_path:
                wav_size = os.path.getsize(wav_path) if os.path.exists(wav_path) else 0
                logging.error(f"Converted file: {wav_path} ({wav_size} bytes)")
            return jsonify({"error": "no speech detected", "details": "The audio file may be too quiet, too short, or contain no clear speech"}), 400

        # If you want to support direct app opening from transcript, call /open_app from frontend after transcription.
        # Otherwise, just return the transcript and let the frontend handle app opening.
        answer = ask_ollama(transcript)
        # If Ollama is not available, return a clean message only
        if answer.startswith('[Ollama not available:') or answer.startswith('[Ollama error:'):
            logging.info(f"Ollama unavailable: {answer}")
            return jsonify({"text": answer, "question": transcript}), 200
        logging.info(f"Ollama answer: {answer!r}")
        return jsonify({"text": answer, "question": transcript}), 200
    except Exception as exc:
        logging.exception("transcribe handler error")
        return jsonify({"error": str(exc)}), 500
    finally:
        try:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)
            # Clean up wav file if created
            wav_path = tmp_path.replace('.webm', '.wav')
            if os.path.exists(wav_path):
                os.unlink(wav_path)
        except Exception:
            logging.exception("failed to delete tmp/wav file")


def parse_command(text):
    """Enhanced command parsing with natural language understanding."""
    text = text.lower().strip()
    
    # Handle websites first
    website_patterns = {
        r'(open|go to|visit)\s*(youtube|you\s*tube)': 'https://youtube.com',
        r'(open|go to|visit)\s*google': 'https://google.com',
        r'(open|go to|visit)\s*(facebook|fb)': 'https://facebook.com',
        r'(open|go to|visit)\s*twitter': 'https://twitter.com',
        r'(open|go to|visit)\s*instagram': 'https://instagram.com',
        r'(open|go to|visit)\s*github': 'https://github.com',
        r'(open|go to|visit)\s*stackoverflow': 'https://stackoverflow.com',
    }
    
    for pattern, url in website_patterns.items():
        if re.search(pattern, text):
            return {"type": "website", "url": url, "name": pattern.split('\\s*')[-1].replace(')', '')}
    
    # Handle app opening commands
    app_patterns = {
        r'(open|start|launch)\s+(notepad|text\s*editor)': 'notepad',
        r'(open|start|launch)\s+(calculator|calc)': 'calculator',
        r'(open|start|launch)\s+(chrome|google\s*chrome)': 'chrome',
        r'(open|start|launch)\s+(brave|brave\s*browser)': 'brave',
        r'(open|start|launch)\s+(edge|microsoft\s*edge)': 'edge',
        r'(open|start|launch)\s+(firefox|mozilla)': 'firefox',
        r'(open|start|launch)\s+(vs\s*code|visual\s*studio\s*code|code)': 'vs code',
        r'(open|start|launch)\s+(word|microsoft\s*word)': 'word',
        r'(open|start|launch)\s+(excel|microsoft\s*excel)': 'excel',
        r'(open|start|launch)\s+(powerpoint|microsoft\s*powerpoint|power\s*point)': 'powerpoint',
        r'(open|start|launch)\s+(explorer|file\s*explorer|files?)': 'explorer',
        r'(open|start|launch)\s+(paint|ms\s*paint)': 'paint',
        r'(open|start|launch)\s+(browser|web\s*browser)': 'edge',
    }
    
    for pattern, app in app_patterns.items():
        if re.search(pattern, text):
            return {"type": "app", "app": app}
    
    # Fallback: try to extract app name after common trigger words
    open_match = re.search(r'(open|start|launch)\s+(.+)', text)
    if open_match:
        app_name = open_match.group(2).strip()
        # Clean up common suffixes
        app_name = re.sub(r'\s+(app|application|program)$', '', app_name)
        return {"type": "app", "app": app_name}
    
    return {"type": "unknown", "text": text}


@app.route("/api/execute", methods=["POST"])
def execute_command():
    """Execute commands based on recognized text with enhanced natural language processing."""
    logging.info("Received /api/execute request")
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"status": "error", "message": "Missing 'text' field"}), 400
        
        text = data['text'].strip()
        logging.info(f"Executing command: {text}")
        
        # Parse the command using enhanced parsing
        parsed = parse_command(text)
        logging.info(f"Parsed command: {parsed}")
        
        if parsed["type"] == "website":
            try:
                import webbrowser
                webbrowser.open(parsed["url"])
                return jsonify({"status": "success", "message": f"Opened {parsed['name']}", "ok": True})
            except Exception as e:
                return jsonify({"status": "error", "message": f"Failed to open {parsed['name']}: {e}"}), 500
        
        elif parsed["type"] == "app":
            try:
                result = execute_app_command(parsed["app"])
                if result.get("status") == "success":
                    return jsonify({"status": "success", "message": result.get("message", "App opened"), "ok": True})
                else:
                    return jsonify({"status": "error", "message": result.get("message", "Failed to open app")}), 404
            except Exception as e:
                return jsonify({"status": "error", "message": f"Failed to open {parsed['app']}: {e}"}), 500
        
        else:
            # If no specific command matched, return info but don't treat as error
            return jsonify({"status": "info", "message": f"Command '{text}' not recognized as an app or website command", "ok": False})
        
    except Exception as e:
        logging.exception("Error in execute_command")
        return jsonify({"status": "error", "message": str(e)}), 500


def execute_app_command(app_name):
    """Enhanced app launching function with multiple fallback methods."""
    app_name = app_name.lower().strip()
    logging.info(f"Attempting to open app: {app_name}")
    
    # Try direct command mapping first
    command = APP_COMMANDS.get(app_name)
    if command:
        try:
            if command.endswith('.exe'):
                logging.info(f"Using os.startfile for: {command}")
                os.startfile(command)
            else:
                logging.info(f"Using shell command: {command}")
                subprocess.Popen(["start", command], shell=True)
            return {"status": "success", "message": f"Opened {app_name}"}
        except Exception as e:
            logging.warning(f"Direct command failed for {app_name}: {e}")
            # Continue to fallback methods
    
    # Fallback method: try common app variations
    fallback_attempts = []
    
    if "notepad" in app_name:
        fallback_attempts.append(("notepad.exe", "notepad"))
    elif "calculator" in app_name or "calc" in app_name:
        fallback_attempts.append(("calc.exe", "calculator"))
    elif "chrome" in app_name:
        fallback_attempts.extend([
            ("start chrome", "Google Chrome"),
            ("start chrome.exe", "Google Chrome")
        ])
    elif "brave" in app_name:
        fallback_attempts.append(("start brave", "Brave Browser"))
    elif "edge" in app_name:
        fallback_attempts.extend([
            ("start msedge", "Microsoft Edge"),
            ("start edge", "Microsoft Edge")
        ])
    elif "firefox" in app_name:
        fallback_attempts.append(("start firefox", "Firefox"))
    elif "explorer" in app_name or "file" in app_name:
        fallback_attempts.append(("explorer.exe", "File Explorer"))
    elif "paint" in app_name:
        fallback_attempts.append(("mspaint.exe", "Paint"))
    elif "word" in app_name:
        fallback_attempts.extend([
            ("start winword", "Microsoft Word"),
            ("start word", "Microsoft Word")
        ])
    elif "excel" in app_name:
        fallback_attempts.extend([
            ("start excel", "Microsoft Excel"),
            ("start xlsx", "Microsoft Excel")
        ])
    elif "powerpoint" in app_name:
        fallback_attempts.extend([
            ("start powerpnt", "Microsoft PowerPoint"),
            ("start powerpoint", "Microsoft PowerPoint")
        ])
    elif "vs code" in app_name or "visual studio code" in app_name or app_name == "code":
        fallback_attempts.extend([
            ("code", "VS Code"),
            ("start code", "VS Code")
        ])
    
    # Try fallback methods
    for command, display_name in fallback_attempts:
        try:
            logging.info(f"Trying fallback command: {command}")
            if command.startswith("start "):
                subprocess.Popen(command.split(), shell=True)
            else:
                subprocess.Popen(command, shell=True)
            return {"status": "success", "message": f"Opened {display_name}"}
        except Exception as e:
            logging.warning(f"Fallback command failed: {command} - {e}")
            continue
    
    # If all else fails, try a generic start command
    try:
        logging.info(f"Trying generic start command for: {app_name}")
        subprocess.Popen(["start", app_name], shell=True)
        return {"status": "success", "message": f"Attempted to open {app_name}"}
    except Exception as e:
        logging.error(f"All methods failed for {app_name}: {e}")
        return {"status": "error", "message": f"Could not open {app_name}. App may not be installed or accessible."}


# 404 error handler must be after app is defined and all routes
@app.errorhandler(404)
def handle_404(e):
    logging.error(f"404 Not Found: {request.path} method={request.method} data={request.get_data(as_text=True)}")
    return jsonify({"status": "error", "message": f"Not found: {request.path}"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)