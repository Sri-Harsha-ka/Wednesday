import React, { useState, useRef, useEffect } from "react";
import { Send, Mic } from "lucide-react";
import ReactMarkdown from "react-markdown";

const Chat = () => {
    const [messages, setMessages] = useState(() => {
        const saved = localStorage.getItem("chat_history");
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return [{ from: "bot", text: "Hello! How can I help you today?" }];
            }
        }
        return [{ from: "bot", text: "Hello! How can I help you today?" }];
    });
    // Save chat history to localStorage whenever messages change
    useEffect(() => {
        localStorage.setItem("chat_history", JSON.stringify(messages));
    }, [messages]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const handleSend = async () => {

        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        setMessages(prev => [...prev, { from: "user", text: userMessage }]);
        setInput("");
        setIsLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout
        try {
            const response = await fetch('http://localhost:5000/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            if (response.ok && data.response) {
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: data.response },
                ]);
            } else {
                const errorMessage = data.details || data.error || 'Sorry, I encountered an error. Please try again.';
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: errorMessage },
                ]);
            }
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: "Request timed out. Please try again." },
                ]);
            } else {
                console.error('Chat API error:', error);
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: "Sorry, I'm having trouble connecting. Please check if the server is running and try again." },
                ]);
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Voice/mic logic
    const handleMicClick = async () => {
        if (isRecording) {
            // Stop recording
            if (mediaRecorderRef.current) {
                mediaRecorderRef.current.stop();
            }
            setIsRecording(false);
        } else {
            // Start recording
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const mediaRecorder = new window.MediaRecorder(stream);
                    mediaRecorderRef.current = mediaRecorder;
                    audioChunksRef.current = [];

                    mediaRecorder.ondataavailable = (e) => {
                        if (e.data.size > 0) {
                            audioChunksRef.current.push(e.data);
                        }
                    };

                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
                        setIsLoading(true);
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
                        try {
                            const formData = new FormData();
                            formData.append("file", audioBlob, "voice.webm");
                            const response = await fetch("http://localhost:5000/transcribe", {
                                method: "POST",
                                body: formData,
                                signal: controller.signal,
                            });
                            clearTimeout(timeoutId);
                            const data = await response.json();
                            if (data.question) {
                                setMessages(prev => [
                                    ...prev,
                                    { from: "user", text: data.question },
                                ]);
                            }
                            if (data.text) {
                                setMessages(prev => [
                                    ...prev,
                                    { from: "bot", text: data.text },
                                ]);
                            } else if (data.error) {
                                setMessages(prev => [
                                    ...prev,
                                    { from: "bot", text: data.error },
                                ]);
                            }
                        } catch (err) {
                            clearTimeout(timeoutId);
                            if (err.name === 'AbortError') {
                                setMessages(prev => [
                                    ...prev,
                                    { from: "bot", text: "Voice recognition timed out. Please try again." },
                                ]);
                            } else {
                                setMessages(prev => [
                                    ...prev,
                                    { from: "bot", text: "Voice recognition failed." },
                                ]);
                            }
                        } finally {
                            setIsLoading(false);
                        }
                    };

                    mediaRecorder.start();
                    setIsRecording(true);
                } catch (err) {
                    alert("Microphone access denied or not available.");
                }
            }
        }
    };

    return (
        <div className="flex flex-col h-full bg-black text-white relative overflow-hidden">
            {/* Glassmorphism background effect */}
            <div className="absolute inset-0 z-0 pointer-events-none" style={{background: "radial-gradient(ellipse at 60% 20%, rgba(6,182,212,0.10) 0%, transparent 70%), radial-gradient(ellipse at 20% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)"}}></div>
            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 xl:px-24 py-6 space-y-4 scrollbar-thin scrollbar-thumb-cyan-700 scrollbar-track-black/30 z-10">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
                    >
                        <div
                            className={`px-5 py-3 rounded-2xl max-w-xs md:max-w-sm lg:max-w-md shadow-lg transition-all duration-300 hover:shadow-cyan-500/40 border-2 ${
                                msg.from === "user"
                                    ? "bg-gradient-to-br from-cyan-900/80 to-indigo-900/80 text-white ml-4 border-cyan-700/60"
                                    : "bg-zinc-900/80 text-cyan-100 border-cyan-800/40 mr-4"
                            }`}
                            style={{backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)"}}
                        >
                            {msg.from === "bot" ? (
                                <ReactMarkdown className="prose prose-invert max-w-none text-sm md:text-base leading-relaxed">
                                    {msg.text}
                                </ReactMarkdown>
                            ) : (
                                <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>
                            )}
                        </div>
                    </div>
                ))}                {/* Typing indicator when AI is responding */}
                {isLoading && (
                    <div className="flex justify-start animate-fadeIn z-10">
                        <div className="px-5 py-3 rounded-2xl bg-zinc-900/80 text-cyan-200 border border-cyan-800/40 mr-4 shadow-cyan-500/20 shadow-lg backdrop-blur-md">
                            <div className="flex items-center space-x-1">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                </div>
                                <span className="text-sm text-cyan-300 ml-2">AI is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input bar - Fixed at bottom */}

            <div className="flex-shrink-0 p-4 bg-zinc-900/90 backdrop-blur-lg border-t border-cyan-900/60 shadow-cyan-500/10 shadow-2xl z-20">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button
                        className={`p-3 rounded-full bg-gradient-to-br from-cyan-700 to-cyan-900 shadow-cyan-400/30 shadow-lg hover:shadow-cyan-400/60 hover:scale-110 transition-all duration-200 group flex-shrink-0 border-2 border-cyan-600 ${isRecording ? "ring-4 ring-cyan-400" : ""}`}
                        onClick={handleMicClick}
                        disabled={isLoading}
                        title={isRecording ? "Stop Recording" : "Start Voice Input"}
                    >
                        <Mic className={`w-5 h-5 ${isRecording ? "text-cyan-200 animate-pulse" : "text-cyan-300 group-hover:text-cyan-100 transition-colors"}`} />
                    </button>

                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                            placeholder={isLoading ? "AI is thinking..." : "How can I help you?"}
                            disabled={isLoading}
                            className="w-full border border-cyan-800 rounded-full px-6 py-3 
                                     focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent
                                     shadow-cyan-400/10 shadow-lg transition-all duration-200 text-sm md:text-base text-white
                                     placeholder-cyan-400 bg-zinc-900/80 disabled:bg-zinc-900 disabled:cursor-not-allowed"
                        />
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-3 rounded-full bg-gradient-to-br from-cyan-700 to-indigo-900 shadow-cyan-400/30 shadow-lg hover:shadow-cyan-400/60 hover:scale-110 transition-all duration-200 text-white disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 border-2 border-cyan-600"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-cyan-200 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Custom CSS for animations and scrollbar */}
            <style jsx>{`
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.3s ease-out;
                }
                
                /* Custom scrollbar styling */
                .scrollbar-thin::-webkit-scrollbar {
                    width: 6px;
                }
                .scrollbar-thin::-webkit-scrollbar-track {
                    background: transparent;
                }
                .scrollbar-thin::-webkit-scrollbar-thumb {
                    background-color: rgba(156, 163, 175, 0.5);
                    border-radius: 3px;
                }
                .scrollbar-thin::-webkit-scrollbar-thumb:hover {
                    background-color: rgba(156, 163, 175, 0.8);
                }
                
                /* Ensure no body overflow */
                html, body {
                    overflow-x: hidden;
                }
            `}</style>
        </div>
    );
};

export default Chat;
