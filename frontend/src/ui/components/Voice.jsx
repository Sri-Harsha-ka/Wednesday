// src/components/Voice.jsx
import React, { useEffect, useRef, useState } from "react";

export default function Voice() {
  const [listening, setListening] = useState(false);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    return () => {
      // cleanup
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const sendToBackend = async (uint8arr) => {
    try {
      const resp = await window.electronAPI.transcribeAudio(uint8arr);
      console.log("Main response:", resp);
      if (resp?.error) setError(resp.error);
      else setLastText(resp?.text || resp?.question || "");
    } catch (e) {
      setError(String(e));
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const options = { mimeType: "audio/webm" };
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const size = blob.size;
          console.log("Recorded blob size:", size);
          if (!size || size < 100) {
            setError("Recorded audio too small. Try speaking louder or record longer.");
            return;
          }
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          // send Uint8Array to preload -> main
          await sendToBackend(uint8);
        } catch (e) {
          setError(String(e));
        }
      };

      mr.start();
      setListening(true);
    } catch (err) {
      setError(String(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setListening(false);
    }
  };

  const toggle = () => {
    if (listening) stopRecording();
    else startRecording();
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 space-y-6">
      <div
        onClick={toggle}
        role="button"
        aria-pressed={listening}
        className={`relative flex items-center justify-center w-64 h-64 rounded-full cursor-pointer transition duration-300`}
        style={{
          background: listening ? "linear-gradient(135deg,#3b82f6,#06b6d4)" : "white",
          boxShadow: listening ? "0 0 35px rgba(59,130,246,0.7)" : "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        {/* <span className="text-white text-4xl z-10">{listening ? "🎙️" : "🎤"}</span> */}
        {listening && <span className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping z-0"></span>}
      </div>

      <div className="text-center">
        {error && <div className="text-sm text-red-600 mb-2">{error}</div>}
        {lastText ? <div className="text-lg font-medium text-gray-700">{lastText}</div> : <div className="text-sm text-gray-500">Click to talk</div>}
      </div>
    </div>
  );
}
