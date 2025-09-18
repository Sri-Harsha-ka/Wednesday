# --- Helper: Convert webm to wav for Whisper compatibility ---
def convert_webm_to_wav(webm_path):
    """Convert a .webm file to .wav using ffmpeg. Returns wav path or None on failure."""
    wav_path = webm_path.replace('.webm', '.wav')
    cmd = [
        'ffmpeg', '-y', '-i', webm_path,
        '-ar', '16000',  # 16kHz sample rate optimal for speech
        '-ac', '1',      # Mono channel
        '-acodec', 'pcm_s16le',  # 16-bit PCM encoding
        '-f', 'wav',     # WAV format
        wav_path
    ]
    try:
        result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:  # WAV header is 44 bytes
            return wav_path
        else:
            return None
    except Exception:
        return None

# --- Helper: Validate audio file ---
def validate_audio_file(file_path):
    """Validate that the audio file exists and has reasonable content."""
    if not os.path.exists(file_path):
        return False, "File does not exist"
    if os.path.getsize(file_path) < 44:  # WAV header is 44 bytes
        return False, "File too small to be valid audio"
    return True, ""

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

# Gemini API config
GEMINI_API_KEY = "AIzaSyBDcViM89OCuOsIjA5r0kBxlbvuEcfp_pY"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

def ask_gemini(question: str) -> str:
    """Send a prompt to Gemini and return the response text."""
    if not GEMINI_API_KEY:
        logging.error("GEMINI_API_KEY not set in environment or .env file.")
        return "[Gemini API key not configured]"
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}
    payload = {
        "contents": [
            {"parts": [{"text": question}]}
        ]
    }
    try:
        res = requests.post(GEMINI_API_URL, headers=headers, params=params, json=payload, timeout=60)
        res.raise_for_status()
        data = res.json()
        # Gemini returns candidates[0].content.parts[0].text
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if parts:
                return parts[0].get("text", "")
        return "[Gemini returned no answer]"
    except Exception as e:
        logging.exception("Gemini request failed")
        return f"[Gemini error: {e}]"




# Device / executor setup for whisper
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


def transcribe_audio(audio_path: str) -> str:
    """Generic transcription wrapper: prefer faster-whisper, fall back to whisper."""
    # Validate audio file first
    is_valid, msg = validate_audio_file(audio_path)
    if not is_valid:
        logging.error(f"Audio validation failed: {msg}")
        return ""
    
    logging.info(f"Attempting transcription of {audio_path} (size: {os.path.getsize(audio_path)} bytes)")
    
    try:
        logging.info("Attempting whisper transcription with enhanced options")
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
        # Additional quality checks for noisy environments
        if text:
            words = text.lower().split()
            if len(words) > 2:
                unique_words = len(set(words))
                repetition_ratio = unique_words / len(words)
                if repetition_ratio < 0.3:
                    logging.warning(f"High repetition detected: {repetition_ratio:.2f}")
                    return ""
            if len(words) < 2 and len(text) < 5:
                logging.warning(f"Transcript too short to be meaningful: '{text}'")
                return ""
            logging.info(f"Whisper succeeded: '{text}'")
        else:
            logging.warning("Whisper returned empty transcript")
            logging.info(f"Full whisper result: {res}")
        return text
    except Exception as e:
        logging.exception("whisper.transcribe failed")
        return ""







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
        answer = ask_gemini(transcript)
        # If Gemini is not available, return a clean message only
        if answer.startswith('[Gemini'):
            logging.info(f"Gemini unavailable: {answer}")
            return jsonify({"text": answer, "question": transcript}), 200
        logging.info(f"Gemini answer: {answer!r}")
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


@app.route("/ask", methods=["POST"])
def ask():
    """Handle chat messages and return Gemini AI responses."""
    logging.info("Received /ask request")
    try:
        data = request.get_json()
        if not data or 'message' not in data:
            return jsonify({"error": "Missing 'message' field"}), 400
        
        message = data['message'].strip()
        if not message:
            return jsonify({"error": "Empty message"}), 400
        
        logging.info(f"Processing chat message: {message}")
        
        # Get AI response using existing Gemini function
        response = ask_gemini(message)
        
        if response.startswith('[Gemini'):
            # Gemini API error or not configured
            logging.warning(f"Gemini unavailable: {response}")
            return jsonify({"error": "AI service unavailable", "details": response}), 503
        
        logging.info(f"Gemini response: {response}")
        return jsonify({"response": response}), 200
        
    except Exception as e:
        logging.exception("Error in ask handler")
        return jsonify({"error": str(e)}), 500


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