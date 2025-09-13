// src/electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  transcribeAudio: (uint8Array) => ipcRenderer.invoke("stt:recognize", uint8Array)
});
