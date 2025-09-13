// src/components/Voice.jsx
import React, { useRef, useState, useEffect } from "react";

export default function Voice() {
  const [listening, setListening] = useState(false);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const manualStopRef = useRef(false);
  const restartingRef = useRef(false);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const dataArrayRef = useRef(null);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {}
      }
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  const speakText = (text) => {
    return new Promise((resolve) => {
      try {
        const utt = new SpeechSynthesisUtterance(text);
        utt.onend = () => resolve();
        utt.onerror = () => resolve();
        speechSynthesis.speak(utt);
      } catch (e) {
        resolve();
      }
    });
  };

  const detectSilence = (stream, onSilence, threshold = 3, timeout = 1000) => {
    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyserRef.current = analyser;
    const dataArray = new Uint8Array(analyser.fftSize);
    dataArrayRef.current = dataArray;

    let silenceStart = null;
    const check = () => {
      analyser.getByteTimeDomainData(dataArray);
      const rms = Math.sqrt(dataArray.reduce((sum, v) => sum + (v - 128) ** 2, 0) / dataArray.length);

      if (rms < threshold) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - silenceStart > timeout) {
          onSilence();
          return;
        }
      } else {
        silenceStart = null;
      }
      requestAnimationFrame(check);
    };
    check();
  };

  const startRecording = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,
          channelCount: 1,
          noiseSuppression: true,
          echoCancellation: true,
        },
      });

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (audioCtxRef.current) audioCtxRef.current.close();

        const blob = new Blob(chunksRef.current, { type: mime });
        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        try {
          const result = await window.electronAPI.transcribeAudio(uint8);
          let reply = "";

          if (result?.error) {
            reply = result.error || "Error occurred";
          } else if (!result?.text || result.text.trim() === "") {
            reply = "I didn't hear anything!";
          }else {
            reply = result.text;
          }

          setLastText(reply);
          await speakText(reply);

          if (!manualStopRef.current) {
            if (!restartingRef.current) {
              restartingRef.current = true;
              setTimeout(() => (restartingRef.current = false), 300);
              startRecording();
            }
          } else {
            setListening(false);
          }
        } catch (ipcErr) {
          const msg = "I couldn't process the audio!";
          setError(String(ipcErr));
          setLastText(msg);
          await speakText(msg);
          setListening(false);
        }
      };

      mediaRecorderRef.current = mr;
      mr.start();
      setListening(true);

      // improved silence detection: longer timeout and better threshold
      detectSilence(stream, () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      }, 2, 5000); // listens for up to 5 seconds of silence

    } catch (err) {
      const msg = "Microphone access denied or unavailable";
      setError(msg);
      setLastText(msg);
      await speakText(msg);
      setListening(false);
    }
  };

  const stopRecording = () => {
    manualStopRef.current = true;
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    } catch (e) {
      console.warn("stop error:", e);
    }
  };

  const toggle = () => {
    if (listening) stopRecording();
    else {
      manualStopRef.current = false;
      startRecording();
    }
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
