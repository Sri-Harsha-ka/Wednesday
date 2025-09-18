#!/usr/bin/env python3

# Simple test server to check if basic functionality works
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import subprocess
import logging

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ok", "message": "Server is running"})

@app.route("/api/execute", methods=["POST"])
def execute_command():
    """Simple test of command execution."""
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({"status": "error", "message": "Missing 'text' field"}), 400
        
        text = data['text']
        logging.info(f"Received command: {text}")
        
        # Simple test command
        if 'notepad' in text.lower():
            try:
                subprocess.Popen(['notepad.exe'])
                return jsonify({"status": "success", "message": "Opened Notepad", "ok": True})
            except Exception as e:
                return jsonify({"status": "error", "message": f"Failed to open Notepad: {e}"}), 500
        
        return jsonify({"status": "info", "message": f"Test server received: {text}", "ok": False})
        
    except Exception as e:
        logging.exception("Error in execute_command")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == "__main__":
    print("Starting test server...")
    app.run(host="0.0.0.0", port=5000, debug=True)