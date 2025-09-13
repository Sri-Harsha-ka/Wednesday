// src/electron/main.js
import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration via env
const ASR_URL = "http://localhost:5000/transcribe" || null; // e.g. "http://localhost:5000/transcribe"
const OLLAMA_HOST = process.env.OLLAMA_HOST || null; // e.g. "http://localhost:11434"
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama2"; // change to your local model name deployed to Ollama

function createWindow() {
  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Automatically allow microphone permission (development convenience)
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media") {
      callback(true);
    } else {
      callback(false);
    }
  });

  win.loadFile(path.join(__dirname, "../../dist-react/index.html"));
  win.maximize();
  win.show();
}

app.whenReady().then(createWindow);

// Helper: call ASR endpoint (must return JSON { text: "..." })
async function callASR(buffer) {
  if (!ASR_URL) {
    throw new Error("ASR_URL not configured. Set process.env.ASR_URL to your transcription service.");
  }

  const form = new FormData();
  form.append("file", buffer, { filename: "speech.webm" });

  const res = await fetch(ASR_URL, {
    method: "POST",
    body: form,
    // don't set Content-Type, form-data does it
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ASR failed: ${res.status} ${txt}`);
  }
  const json = await res.json();
  // Expect { text: "..." }
  return json.text;
}

// Helper: call Ollama generate (best-effort — Ollama's API may return streaming)
async function callOllama(prompt) {
  if (!OLLAMA_HOST) return null;

  // Ollama generate endpoint (best-effort). Some Ollama setups stream results.
  // We try a simple POST and parse text/plain or JSON response if possible.
  try {
    const body = {
      model: OLLAMA_MODEL,
      prompt: prompt,
      // you can add other parameters as needed
    };

    const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // many Ollama endpoints return streaming text/event-stream. If it's JSON or plain text, we'll parse it.
    const contentType = res.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const parsed = await res.json();
      // Ollama responses can vary; try a few fields
      if (parsed?.results && Array.isArray(parsed.results)) {
        // sometimes Ollama returns array of tokens/outputs
        const joined = parsed.results.map(r => (r?.content ?? "")).join("");
        return joined || null;
      }
      if (parsed?.output) {
        // some endpoints place text in output
        if (Array.isArray(parsed.output)) return parsed.output.join("");
        return String(parsed.output);
      }
      return JSON.stringify(parsed);
    } else {
      // fallback: read as text
      const txt = await res.text();
      return txt;
    }
  } catch (err) {
    console.warn("callOllama error:", err);
    return null;
  }
}

// IPC: receive Uint8Array from renderer, transcribe (ASR), then optionally call Ollama
ipcMain.handle("stt:recognize", async (event, uint8arr) => {
  try {
    const buffer = Buffer.from(uint8arr);

    // Optionally save temp for debugging
    // fs.writeFileSync(path.join(__dirname, "last_speech.webm"), buffer);

    // 1) Transcribe using ASR endpoint (you must run a local ASR server)
    let transcript = "";
    try {
      transcript = await callASR(buffer);
    } catch (asrErr) {
      console.error("ASR error:", asrErr);
      return { error: "ASR failed: " + String(asrErr.message || asrErr) };
    }

    if (!transcript || transcript.trim() === "") {
      return { error: "Empty transcription" };
    }

    // 2) Optionally pass transcript to Ollama for any transformation
    if (OLLAMA_HOST) {
      // Example prompt — you can modify how you want Ollama to respond
      const prompt = `User said: "${transcript}". Reply exactly like: You said ${transcript}`;
      const ollamaReply = await callOllama(prompt);
      if (ollamaReply && ollamaReply.trim() !== "") {
        return { text: ollamaReply.trim() };
      }
      // fallback to simple echo if Ollama failed
    }

    // Default behavior (no Ollama): echo
    return { text: `You said ${transcript}` };
  } catch (err) {
    console.error("stt:recognize handler error:", err);
    return { error: String(err) };
  }
});
