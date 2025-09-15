// src/electron/main.js
import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";
import FormData from "form-data";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ASR_URL = process.env.ASR_URL || "http://localhost:5000/transcribe";

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

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media") callback(true);
    else callback(false);
  });

  win.loadFile(path.join(__dirname, "../../dist-react/index.html"));
  win.maximize();
  win.show();
}

app.whenReady().then(createWindow);

async function callASR(buffer) {
  if (!ASR_URL) throw new Error("ASR_URL not configured");

  // buffer is Node Buffer
  const form = new FormData();
  // ensure content type and filename are provided
  form.append("file", buffer, { filename: "speech.webm", contentType: "audio/webm" });

  // debug: log size
  const size = Buffer.isBuffer(buffer) ? buffer.length : 0;
  console.log("callASR: sending buffer size:", size);

  const res = await fetch(ASR_URL, {
    method: "POST",
    body: form,
    headers: form.getHeaders ? form.getHeaders() : {},
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`ASR server error: ${res.status} ${txt}`);
  }
  return res.json();
}

ipcMain.handle("stt:recognize", async (event, arrayLike) => {
  try {
    const uint8 = Uint8Array.from(arrayLike || []);
    const buffer = Buffer.from(uint8);
    if (!buffer || buffer.length === 0) return { error: "empty buffer from renderer" };

    const json = await callASR(buffer);
    if (json && json.error) return { error: json.error };

    return { text: json.text || "", question: json.question || "" };
  } catch (err) {
    return { error: String(err) };
  }
});
