// src/electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // accept a Uint8Array from renderer and forward to main
  transcribeAudio: (uint8Array) => ipcRenderer.invoke("stt:recognize", Array.from(uint8Array))
});
