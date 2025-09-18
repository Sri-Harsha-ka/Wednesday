// src/components/Voice.jsx
import React, { useEffect, useRef, useState } from "react";

export default function Voice() {
  const [listening, setListening] = useState(false);
  const [lastText, setLastText] = useState("");
  const [error, setError] = useState(null);
  const [speaking, setSpeaking] = useState(false);

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
  const recordingStartTimeRef = useRef(0);
  const streamRef = useRef(null); // Store the MediaStream for proper cleanup

  useEffect(() => {
    // Initialize voices for TTS
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      console.log('Available voices:', voices.length);
    };
    
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices();

    return () => {
      // cleanup
      cleanupRecording();
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      // Stop any ongoing speech
      window.speechSynthesis.cancel();
    };
  }, []);

  // Comprehensive cleanup function
  const cleanupRecording = () => {
    try {
      // Stop MediaRecorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaRecorderRef.current = null;

      // Stop and cleanup MediaStream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
        });
        streamRef.current = null;
      }

      // Cleanup VAD interval
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }

      // Cleanup WebAudio
      if (analyserRef.current) {
        try {
          analyserRef.current.disconnect();
        } catch (e) {
          console.warn("Error disconnecting analyser:", e);
        }
        analyserRef.current = null;
      }
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {
          console.warn("Error disconnecting source:", e);
        }
        sourceRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try {
          audioCtxRef.current.close();
        } catch (e) {
          console.warn("Error closing audio context:", e);
        }
        audioCtxRef.current = null;
      }

      // Reset state
      setListening(false);
      chunksRef.current = [];
      cancelledRef.current = false;
      vadSilenceStartRef.current = 0;
    } catch (e) {
      console.warn("Error during cleanup:", e);
    }
  };

  // Text-to-speech function
  const speakText = (text) => {
    if (!text || text.trim() === "") return;
    
    // Stop any current speech
    window.speechSynthesis.cancel();
    
    setSpeaking(true);
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Configure voice settings
    utterance.rate = 0.9;
    utterance.pitch = 1.0;
    utterance.volume = 0.8;
    
    // Try to use a better voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => 
      voice.lang.includes('en') && (voice.name.includes('Google') || voice.name.includes('Microsoft'))
    );
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    
    window.speechSynthesis.speak(utterance);
  };

  const sendToBackend = async (uint8arr) => {
    try {
      console.log("Sending audio to backend, size:", uint8arr.length);
      const resp = await window.electronAPI.transcribeAudio(uint8arr);
      console.log("Transcription response:", resp);
      if (resp?.error) {
        console.error("Transcription error:", resp.error);
        
        // Handle specific error cases with better user feedback
        if (resp.error.includes("no speech detected") || resp.error.includes("too quiet")) {
          setError("No speech detected. Please speak louder and closer to the microphone.");
          speakText("I couldn't hear you clearly. Please speak louder and try again.");
        } else if (resp.error.includes("too short")) {
          setError("Recording too short. Please speak for at least 2 seconds.");
          speakText("Please speak for a bit longer so I can understand you.");
        } else {
          setError(resp.error);
          speakText("Sorry, I couldn't understand that. Please try again.");
        }
        return;
      }

      const llmText = resp?.text || ""; // answer from Ollama (or command message)
      const question = resp?.question || ""; // recognized user speech
      const confidence = resp?.confidence || 0; // transcription confidence if available

      console.log("Transcription result:", { question, llmText, confidence });

      // Enhanced quality checks for noisy environments
      const isHighQuality = question.length >= 5 && // Minimum length
                           !question.match(/^[^a-zA-Z]*$/) && // Not just symbols/numbers
                           !question.match(/^\s*$/) && // Not just whitespace
                           question.split(' ').length >= 2; // At least 2 words

      if (!isHighQuality) {
        console.log("Low quality transcription rejected:", question);
        setError("I didn't catch that clearly. Please speak more clearly and use complete phrases.");
        speakText("I didn't understand that clearly. Please try speaking more clearly with complete phrases like 'Can you open calculator'.");
        return;
      }

      // If server already executed the command and returned a command_executed flag,
      // show that result directly and don't call /api/execute again.
      if (resp?.command_executed) {
        const responseText = llmText || question || "";
        setLastText(responseText);
        speakText(responseText);
        return;
      }

      // Enhanced command patterns requiring more explicit phrases
      const commandPatterns = [
        // Full phrase patterns - much more reliable in noisy environments
        /(?:can you|could you|please)\s+(open|start|launch|run)\s+(.+)/i,
        /(?:open|start|launch|run)\s+(.+)(?:\s+please|\s+for me)/i,
        
        // Specific application commands with context
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:the\s+)?calculator/i,
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:the\s+)?notepad/i,
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:the\s+)?chrome/i,
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:the\s+)?firefox/i,
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:the\s+)?edge/i,
        /(?:can you|could you|please)?\s*(?:open|start|launch)\s+(?:file\s+)?explorer/i,
        
        // Website navigation with full phrases
        /(?:can you|could you|please)?\s*(?:go to|visit|open)\s+(.+?)(?:\s+website|\s+site)?/i,
        /(?:navigate to|take me to)\s+(.+)/i,
        
        // Task-specific commands
        /(?:can you|could you|please)?\s*(?:help me|assist me|do)\s+(.+)/i
      ];
      
      // Check if the question is long enough and matches our patterns
      const isLongEnough = question.length >= 10; // Minimum 10 characters
      const isCommand = isLongEnough && commandPatterns.some(pattern => pattern.test(question));
      
      console.log('Command analysis:', {
        question,
        length: question.length,
        isLongEnough,
        isCommand,
        patterns: commandPatterns.map(p => p.test(question))
      });
      
      if (isCommand) {
        try {
          console.log("Executing command:", question);
          setLastText("Processing your request...");
          
          const r = await fetch("http://127.0.0.1:5000/api/execute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: question }),
          });
          
          if (r.ok) {
            const j = await r.json();
            console.log("Command response:", j);
            const msg = j?.message || (j?.ok ? "Command executed successfully" : "Command failed");
            setLastText(`✓ ${msg}`);
            speakText(msg);
          } else {
            const txt = await r.text();
            console.error("Command failed with status:", r.status, txt);
            const errorText = "Sorry, I couldn't execute that command";
            setLastText(errorText);
            speakText("Sorry, I couldn't execute that command. Please try again.");
          }
        } catch (ex) {
          console.error("Execute API error:", ex);
          const errorText = "Command execution failed";
          setLastText(errorText);
          speakText("Sorry, there was an error executing the command.");
        }
        return;
      }

      // If not recognized as a command, provide helpful guidance
      if (question.length > 5) {
        const guidanceText = "I heard you say: '" + question + "'. For commands, please use phrases like 'Can you open calculator' or 'Please start notepad'.";
        setLastText(guidanceText);
        speakText("I heard you, but I didn't recognize that as a command. Try saying 'Can you open calculator' or 'Please start notepad'.");
        return;
      }

      // Not a command — show the LLM/text response
      const responseText = llmText || question || "I didn't catch that.";
      setLastText(responseText);
      speakText(responseText);
    } catch (e) {
      setError(String(e));
      speakText("Sorry, there was an error processing your request.");
    }
  };

  const startRecording = async () => {
    setError(null);
    
    // Clean up any existing recording state first
    cleanupRecording();
    
    try {
      // don't clear doNotSendRef here; it's used to cancel a pending start
      // Enhanced constraints optimized for noisy environments
      const constraints = { 
        audio: { 
          channelCount: 1,  // Mono for better noise suppression
          echoCancellation: true, 
          noiseSuppression: true,  // Critical for noisy environments
          autoGainControl: true,   // Helps normalize volume levels
          sampleRate: 16000,       // Optimal for speech recognition
          sampleSize: 16,
          // Advanced constraints for better noise handling
          googEchoCancellation: true,
          googAutoGainControl: true,
          googNoiseSuppression: true,
          googHighpassFilter: true,
          googTypingNoiseDetection: true,
          googBeamforming: true,
          googArrayGeometry: [0, 0, 0, 0.05, 0, 0],
          // Audio processing constraints
          latency: 0.01,  // Low latency for better responsiveness
          volume: 0.8     // Slightly lower to avoid clipping
        } 
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream; // Store stream reference for cleanup
      chunksRef.current = [];
      
      // Try different MIME types for better compatibility
      let options;
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        options = { mimeType: 'audio/webm;codecs=opus' };
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        options = { mimeType: 'audio/webm' };
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        options = { mimeType: 'audio/mp4' };
      } else {
        options = {}; // Let the browser choose
      }
      
      console.log('Using MediaRecorder options:', options);
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

          const mimeType = options.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const size = blob.size;
          console.log("Recorded blob size:", size, "MIME type:", mimeType);
          
          if (!size || size < 1000) { // Increased minimum size for better quality
            setError("Recording too short. Please speak for at least 2-3 seconds with complete phrases.");
            speakText("Please speak longer with complete phrases like 'Can you open the calculator'.");
            return;
          }
          const arrayBuffer = await blob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          // send Uint8Array to preload -> main
          await sendToBackend(uint8);
        } catch (e) {
          setError(String(e));
        } finally {
          // Cleanup stream after processing
          if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => {
              track.stop();
            });
            streamRef.current = null;
          }
        }
      };

      mr.start();
      setListening(true);
      recordingStartTimeRef.current = Date.now();

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
        const freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
        
        // Advanced VAD parameters for noisy environments
        const SILENCE_MS = 3000; // Longer silence before auto-stop
        const MIN_RECORDING_MS = 2000; // Minimum recording time (2 seconds for full phrases)
        const NOISE_FLOOR_SAMPLES = 10; // Samples to establish noise floor
        const SPEECH_FREQ_MIN = 300; // Hz - minimum speech frequency
        const SPEECH_FREQ_MAX = 3400; // Hz - maximum speech frequency
        
        // Dynamic threshold calculation
        let noiseFloor = 0;
        let noiseFloorSamples = 0;
        let adaptiveThreshold = 0.008; // Starting threshold

        vadSilenceStartRef.current = 0;
        if (vadIntervalRef.current) clearInterval(vadIntervalRef.current);
        
        vadIntervalRef.current = setInterval(() => {
          try {
            const recordingDuration = Date.now() - recordingStartTimeRef.current;
            
            // Get both time and frequency domain data
            analyserRef.current.getFloatTimeDomainData(dataArr);
            analyserRef.current.getByteFrequencyData(freqData);
            
            // Calculate RMS energy
            let sum = 0.0;
            for (let i = 0; i < dataArr.length; i++) {
              sum += dataArr[i] * dataArr[i];
            }
            const rms = Math.sqrt(sum / dataArr.length);
            
            // Calculate spectral energy in speech frequency range
            const sampleRate = 16000;
            const nyquist = sampleRate / 2;
            const binWidth = nyquist / freqData.length;
            const minBin = Math.floor(SPEECH_FREQ_MIN / binWidth);
            const maxBin = Math.floor(SPEECH_FREQ_MAX / binWidth);
            
            let speechEnergy = 0;
            let totalEnergy = 0;
            for (let i = 0; i < freqData.length; i++) {
              const energy = freqData[i] / 255.0;
              totalEnergy += energy;
              if (i >= minBin && i <= maxBin) {
                speechEnergy += energy;
              }
            }
            
            const speechRatio = totalEnergy > 0 ? speechEnergy / totalEnergy : 0;
            
            // Establish noise floor during first few samples
            if (noiseFloorSamples < NOISE_FLOOR_SAMPLES) {
              noiseFloor += rms;
              noiseFloorSamples++;
              if (noiseFloorSamples === NOISE_FLOOR_SAMPLES) {
                noiseFloor /= NOISE_FLOOR_SAMPLES;
                adaptiveThreshold = Math.max(0.005, noiseFloor * 3); // 3x noise floor
                console.log('Noise floor established:', noiseFloor.toFixed(4), 'Adaptive threshold:', adaptiveThreshold.toFixed(4));
              }
              return;
            }
            
            // Don't allow VAD to stop recording too early
            if (recordingDuration < MIN_RECORDING_MS) {
              return;
            }
            
            // Enhanced voice detection: RMS above threshold AND good speech frequency ratio
            const isSpeech = rms > adaptiveThreshold && speechRatio > 0.3;
            
            console.log('VAD:', {
              rms: rms.toFixed(4),
              threshold: adaptiveThreshold.toFixed(4),
              speechRatio: speechRatio.toFixed(3),
              isSpeech,
              duration: recordingDuration
            });
            
            if (isSpeech) {
              // Speech detected - reset silence timer
              vadSilenceStartRef.current = 0;
            } else {
              // No speech detected
              if (!vadSilenceStartRef.current) {
                vadSilenceStartRef.current = Date.now();
              } else if (Date.now() - vadSilenceStartRef.current > SILENCE_MS) {
                // Auto-stop after prolonged silence
                console.log('VAD auto-stop: silence for', Date.now() - vadSilenceStartRef.current, 'ms');
                stopRecording();
              }
            }
          } catch (e) {
            console.warn("VAD processing error:", e);
          }
        }, 100); // More frequent analysis for better responsiveness
      } catch (e) {
        // WebAudio may fail in some contexts; silently ignore VAD if so
        console.warn("VAD init failed", e);
      }
    } catch (err) {
      console.error("Error starting recording:", err);
      
      // Cleanup on error
      cleanupRecording();
      
      // Provide user-friendly error messages
      let errorMessage = "Failed to start recording";
      if (err.name === 'NotAllowedError') {
        errorMessage = "Microphone access denied. Please allow microphone permissions and try again.";
      } else if (err.name === 'NotFoundError') {
        errorMessage = "No microphone found. Please connect a microphone and try again.";
      } else if (err.name === 'NotReadableError') {
        errorMessage = "Microphone is already in use by another application.";
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = "Microphone doesn't support the required audio format.";
      } else if (err.name === 'SecurityError') {
        errorMessage = "Microphone access blocked due to security restrictions.";
      }
      
      setError(errorMessage);
      speakText("Sorry, I couldn't access your microphone. Please check your permissions and try again.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.warn("Error stopping MediaRecorder:", e);
      }
    }
    // Don't call full cleanup here as we still need to process the recorded data
    // Only cleanup the VAD and audio context
    try {
      if (vadIntervalRef.current) {
        clearInterval(vadIntervalRef.current);
        vadIntervalRef.current = null;
      }
      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close();
        audioCtxRef.current = null;
      }
    } catch (e) {
      console.warn("Error cleaning up audio context:", e);
    }
    setListening(false);
  };

  const cancelRecording = () => {
    // Mark that we don't want to send the next recording. If recorder exists, stop it.
    doNotSendRef.current = true;
    cancelledRef.current = true;
    
    // Clear collected chunks immediately
    chunksRef.current = [];
    
    // Use comprehensive cleanup
    cleanupRecording();
  };

  const handleClick = () => {
    // Use timestamp-based double-click detection so we can cancel immediately
    const DOUBLE_MS = 500; // Increased for more reliable detection
    const now = Date.now();

    // Clear any pending timeout first
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }

    if (lastClickRef.current && now - lastClickRef.current < DOUBLE_MS) {
      // double click detected
      lastClickRef.current = 0;
      console.log("Double-click detected - cancelling recording");
      
      // If currently recording, cancel immediately
      if (listening) {
        doNotSendRef.current = true;
        cancelRecording();
        setError("Recording cancelled");
        speakText("Recording cancelled");
      }
      return;
    }

    // not a double click — record this click time
    lastClickRef.current = now;

    // Start or stop immediately for responsive UX
    if (listening) {
      console.log("Stopping recording via single click");
      stopRecording();
    } else {
      console.log("Starting recording via single click");
      // Reset any cancel flags before starting
      doNotSendRef.current = false;
      cancelledRef.current = false;
      startRecording();
    }

    // schedule a cleanup to clear the last click after the double-click window
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
          background: listening 
            ? "linear-gradient(135deg,#3b82f6,#06b6d4)" 
            : speaking 
            ? "linear-gradient(135deg,#10b981,#059669)"
            : "white",
          boxShadow: listening 
            ? "0 0 35px rgba(59,130,246,0.7)" 
            : speaking 
            ? "0 0 35px rgba(16,185,129,0.7)"
            : "0 4px 12px rgba(0,0,0,0.12)",
        }}
      >
        <span className="text-4xl z-10">
          {listening ? "🎙️" : speaking ? "🔊" : "🎤"}
        </span>
        {listening && <span className="absolute inset-0 rounded-full border-4 border-blue-400 animate-ping z-0"></span>}
        {speaking && <span className="absolute inset-0 rounded-full border-4 border-green-400 animate-pulse z-0"></span>}
      </div>

      <div className="text-center max-w-4xl">
        {error && <div className="text-sm text-red-600 mb-3 p-3 bg-red-50 rounded-lg border border-red-200">{error}</div>}
        
        <div className="text-sm text-gray-600 mb-3">
          {listening ? 
            "🎤 Listening... Speak clearly with complete phrases (double-click to cancel)" : 
            speaking ? 
            "🔊 Speaking..." : 
            "Click to start voice command"
          }
        </div>
        
        {!listening && !speaking && (
          <div className="text-xs text-gray-500 mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <strong>💡 Voice Command Tips:</strong><br/>
            • Use complete phrases: <em>"Can you open calculator"</em><br/>
            • Be specific: <em>"Please start notepad"</em><br/>
            • Speak clearly for 2-3 seconds<br/>
            • Avoid background noise when possible
          </div>
        )}
        
        {lastText && (
          <div className="text-lg font-medium text-gray-700 p-4 bg-white rounded-lg shadow-md border-l-4 border-blue-500">
            {lastText}
          </div>
        )}
      </div>
    </div>
  );
}
