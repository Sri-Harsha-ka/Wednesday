from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import tempfile
import requests
import whisper
import logging
import json

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__)
CORS(app)

MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny")
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama2")

logging.info(f"Loading Whisper model: {MODEL_NAME}")
model = whisper.load_model(MODEL_NAME)


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

        logging.info("Starting Whisper transcription")
        result = model.transcribe(tmp_path)
        transcript = result.get("text", "").strip()
        logging.info(f"Transcript: {transcript!r}")

        if not transcript:
            return jsonify({"error": "no speech detected"}), 400

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