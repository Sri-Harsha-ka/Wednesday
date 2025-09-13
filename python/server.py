# server.py
from flask import Flask, request, jsonify
import tempfile, os
import whisper

app = Flask(__name__)

# choose model: tiny / base / small / medium / large
MODEL_NAME = os.environ.get("WHISPER_MODEL", "tiny")
print("Loading Whisper model:", MODEL_NAME)
model = whisper.load_model(MODEL_NAME)

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "file" not in request.files:
        return jsonify({"error": "no file provided"}), 400

    f = request.files["file"]
    # save temp
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp:
        f.save(tmp.name)
        tmp_path = tmp.name

    try:
        # whisper handles conversion with ffmpeg internally
        result = model.transcribe(tmp_path)
        text = result.get("text", "").strip()
        return jsonify({"text": text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp_path)
        except:
            pass

if __name__ == "__main__":
    # dev server
    app.run(host="0.0.0.0", port=5000, debug=True)
