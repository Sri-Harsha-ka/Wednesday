#!/usr/bin/env python3
"""Simple chat server for testing Gemini integration without heavy dependencies."""

import os
import logging
from flask import Flask, request, jsonify
from flask_cors import CORS
import requests

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

app = Flask(__name__)
CORS(app)

# Gemini API config
GEMINI_API_KEY = "AIzaSyBDcViM89OCuOsIjA5r0kBxlbvuEcfp_pY"
GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"

def ask_gemini(question: str) -> str:
    """Send a prompt to Gemini and return the response text."""
    if not GEMINI_API_KEY:
        logging.error("GEMINI_API_KEY not set in environment or .env file.")
        return "[Gemini API key not configured. Please set your GEMINI_API_KEY environment variable.]"
    
    headers = {"Content-Type": "application/json"}
    params = {"key": GEMINI_API_KEY}
    payload = {
        "contents": [
            {"parts": [{"text": question}]}
        ]
    }
    
    try:
        logging.info(f"Sending request to Gemini for: {question[:50]}...")
        res = requests.post(GEMINI_API_URL, headers=headers, params=params, json=payload, timeout=60)
        res.raise_for_status()
        data = res.json()
        
        # Parse Gemini response
        candidates = data.get("candidates", [])
        if candidates:
            content = candidates[0].get("content", {})
            parts = content.get("parts", [])
            if parts:
                response_text = parts[0].get("text", "")
                logging.info(f"Gemini response received: {response_text[:100]}...")
                return response_text
        
        logging.warning("Gemini returned no content")
        return "[Gemini returned no answer]"
        
    except requests.exceptions.RequestException as e:
        logging.exception(f"Gemini request failed: {e}")
        return f"[Network error: {e}]"
    except Exception as e:
        logging.exception(f"Gemini request failed: {e}")
        return f"[Gemini error: {e}]"

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
        
        # Get AI response using Gemini function
        response = ask_gemini(message)
        
        if response.startswith('['):
            # Gemini API error or not configured
            logging.warning(f"Gemini unavailable: {response}")
            return jsonify({"error": "AI service unavailable", "details": response}), 503
        
        logging.info("Successfully got Gemini response")
        return jsonify({"response": response}), 200
        
    except Exception as e:
        logging.exception("Error in ask handler")
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    """Health check endpoint."""
    return jsonify({"status": "ok", "gemini_configured": bool(GEMINI_API_KEY)}), 200

if __name__ == "__main__":
    logging.info("Starting simple chat server...")
    logging.info(f"Gemini API configured: {bool(GEMINI_API_KEY)}")
    app.run(host="0.0.0.0", port=5001, debug=True)