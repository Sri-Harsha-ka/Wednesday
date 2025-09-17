// src/components/Voice.jsx
import React, { useEffect, useRef, useState } from "react";

export default function Voice() {
  const [listening, setListening] = useState(false);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState(null);

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const cancelledRef = useRef(false);
  const clickTimeoutRef = useRef(null);
  const lastClickRef = useRef(0);
  const doNotSendRef = useRef(false);
  const audioCtxRef = useRef(null);
  const analyserRef = useRef(null);
  const sourceRef = useRef(null);
  const vadSilenceStartRef = useRef(0);
  const vadIntervalRef = useRef(null);

  useEffect(() => {
    return () => {
      // cleanup
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  const sendToBackend = async (uint8arr) => {
    try {
      const resp = await window.electronAPI.transcribeAudio(uint8arr);
      console.log("Main response:", resp);
      if (resp?.error) {
        setError(resp.error);
        return;
      }

      const llmText = resp?.text || ""; // answer from Ollama (or command message)
      const question = resp?.question || ""; // recognized user speech

      // If server already executed the command and returned a command_executed flag,
      // show that result directly and don't call /api/execute again.
      if (resp?.command_executed) {
        setLastText(llmText || question || "");
        return;
      }

      // Otherwise, if the recognized speech looks like a command (e.g. "open youtube"), call execute endpoint
      const isCommand = /(^|\s)open\s+/i.test(question);
      if (isCommand) {
        try {
          const r = await fetch("http://127.0.0.1:5000/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: question }),
          });
          if (r.ok) {
            const j = await r.json();
            const msg = j?.message || (j?.ok ? "Command executed" : "Command failed");
            setLastText((prev) => {
              const pieces = [];
              if (llmText) pieces.push(llmText);
              pieces.push(`Command: ${msg}`);
              return pieces.join("\n\n");
            });
          } else {
            const txt = await r.text();
            setLastText((prev) => `${llmText}\n\nCommand error: ${r.status} ${txt}`);
          }
        } catch (ex) {
          console.warn("execute api error", ex);
          setLastText((prev) => `${llmText}\n\nCommand error: ${String(ex)}`);
        }
        return;
      }

      // Not a command — show the LLM/text response
      setLastText(llmText || question || "");
    } catch (e) {
      setError(String(e));
    }
  };

  const startRecording = async () => {
    setError(null);
    try {
      // don't clear doNotSendRef here; it's used to cancel a pending start
      // Request helpful constraints: mono, echo cancellation and noise suppression
      const constraints = { audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      chunksRef.current = [];
      const options = { mimeType: "audio/webm" };
      const mr = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = async () => {
        try {
          // If the recording was cancelled via double-click or a pending cancel, skip sending
          if (cancelledRef.current || doNotSendRef.current) {
            // clear chunks and reset cancel flags
            chunksRef.current = [];
            cancelledRef.current = false;
            doNotSendRef.current = false;
            return;
          }

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
        } finally {
          // cleanup audio monitors
          try {
            if (vadIntervalRef.current) {
              clearInterval(vadIntervalRef.current);
              vadIntervalRef.current = null;
            }
            if (analyserRef.current) analyserRef.current.disconnect();
            if (sourceRef.current) sourceRef.current.disconnect();
            if (audioCtxRef.current) {
              try {
                audioCtxRef.current.close();
              } catch (_) {}
              audioCtxRef.current = null;
            }
          } catch (_e) {
            // ignore
          }
        }
      };

      mr.start();
      setListening(true);

      // If a double-click cancel happened before MediaRecorder was ready,
      // stop immediately and avoid sending the audio.
      if (doNotSendRef.current) {
        try {
          mr.stop();
        } catch (e) {
          console.warn("error stopping recorder after doNotSend", e);
        }
        setListening(false);
      }

      // Setup a small VAD using WebAudio to stop on silence
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        audioCtxRef.current = new AudioCtx();
        sourceRef.current = audioCtxRef.current.createMediaStreamSource(stream);
        analyserRef.current = audioCtxRef.current.createAnalyser();
        analyserRef.current.fftSize = 2048;
        sourceRef.current.connect(analyserRef.current);

        const bufferLength = analyserRef.current.fftSize;
        const dataArr = new Float32Array(bufferLength);
        const SILENCE_MS = 800; // ms of silence before auto-stop
        const THRESHOLD = 0.01; // RMS threshold for silence; tweak in noisy environments

        vadSilenceStartRef.current = 0;
        if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = setInterval(() => {
          try {
            analyserRef.current.getFloatTimeDomainData(dataArr);
            let sum = 0.0;
            for (let i = 0; i < dataArr.length; i++) {
              sum += dataArr[i] * dataArr[i];
            }
            const rms = Math.sqrt(sum / dataArr.length);
            // console.log('VAD RMS', rms);
            if (rms > THRESHOLD) {
              // voice present
              vadSilenceStartRef.current = 0;
            } else {
              // silence
              if (!vadSilenceStartRef.current) vadSilenceStartRef.current = Date.now();
              else if (Date.now() - vadSilenceStartRef.current > SILENCE_MS) {
                // auto-stop when we've been silent for long enough
                stopRecording();
              }
            }
          } catch (e) {
            // swallow
          }
        }, 150);
      } catch (e) {
        // WebAudio may fail in some contexts; silently ignore VAD if so
        console.warn("VAD init failed", e);
      }
    } catch (err) {
      setError(String(err));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      setListening(false);
      // stop VAD/AudioContext
      try {
        if (vadIntervalRef.current) {
          clearInterval(vadIntervalRef.current);
          vadIntervalRef.current = null;
        }
        if (analyserRef.current) analyserRef.current.disconnect();
        if (sourceRef.current) sourceRef.current.disconnect();
        if (audioCtxRef.current) {
          try {
            audioCtxRef.current.close();
          } catch (_) {}
          audioCtxRef.current = null;
        }
      } catch (_e) {
        // ignore
      }
    }
  };

  const cancelRecording = () => {
    // Mark that we don't want to send the next recording. If recorder exists, stop it.
    doNotSendRef.current = true;
    // Only cancel if currently recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      cancelledRef.current = true;
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("error stopping recorder on cancel", e);
        cancelledRef.current = false;
      }
      setListening(false);
      // clear collected chunks immediately
      chunksRef.current = [];
    }
  };

  const handleClick = () => {
    // Use timestamp-based double-click detection so we can cancel immediately
    const DOUBLE_MS = 300;
    const now = Date.now();

    if (now - lastClickRef.current < DOUBLE_MS) {
      // double click detected
      lastClickRef.current = 0;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      // If currently recording, cancel immediately. If not recording or MediaRecorder not ready,
      // mark doNotSend so the soon-to-start recorder is immediately stopped and not uploaded.
      doNotSendRef.current = true;
      cancelRecording();
      return;
    }

    // not a double click — record this click time
    lastClickRef.current = now;

    // Start or stop immediately for responsive UX
    if (listening) {
      stopRecording();
    } else {
      startRecording();
    }

    // schedule a cleanup to clear the last click after the double-click window
    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      lastClickRef.current = 0;
    }, DOUBLE_MS);
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 space-y-6">
      <div
        onClick={handleClick}
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
