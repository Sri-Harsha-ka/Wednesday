import React, { useState } from "react";
import { Send, Mic } from "lucide-react";

const Chat = () => {
    const [messages, setMessages] = useState([
        { from: "bot", text: "Hello! How can I help you today?" },
    ]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = input.trim();
        // Add user message
        setMessages(prev => [...prev, { from: "user", text: userMessage }]);
        setInput("");
        setIsLoading(true);

        try {
            // Call the backend API for Gemini AI response
            const response = await fetch('http://localhost:5000/ask', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: userMessage }),
            });

            const data = await response.json();

            if (response.ok && data.response) {
                // Add AI response
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: data.response },
                ]);
            } else {
                // Handle API errors
                const errorMessage = data.details || data.error || 'Sorry, I encountered an error. Please try again.';
                setMessages(prev => [
                    ...prev,
                    { from: "bot", text: errorMessage },
                ]);
            }
        } catch (error) {
            console.error('Chat API error:', error);
            setMessages(prev => [
                ...prev,
                { from: "bot", text: "Sorry, I'm having trouble connecting. Please check if the server is running and try again." },
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-blue-50">
            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-16 xl:px-24 py-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"} animate-fadeIn`}
                    >
                        <div
                            className={`px-5 py-3 rounded-2xl max-w-xs md:max-w-sm lg:max-w-md shadow-md transition-all duration-200 hover:shadow-lg ${
                                msg.from === "user"
                                    ? "bg-gradient-to-r from-blue-500 to-indigo-600 text-white ml-4"
                                    : "bg-white text-gray-800 border border-gray-100 mr-4"
                            }`}
                        >
                            <p className="text-sm md:text-base leading-relaxed">{msg.text}</p>
                        </div>
                    </div>
                ))}
                
                {/* Typing indicator when AI is responding */}
                {isLoading && (
                    <div className="flex justify-start animate-fadeIn">
                        <div className="px-5 py-3 rounded-2xl bg-white text-gray-800 border border-gray-100 mr-4 shadow-md">
                            <div className="flex items-center space-x-1">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                </div>
                                <span className="text-sm text-gray-500 ml-2">AI is thinking...</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input bar - Fixed at bottom */}
            <div className="flex-shrink-0 p-4 bg-white/90 backdrop-blur-sm border-t border-gray-200/50 shadow-lg">
                <div className="max-w-4xl mx-auto flex items-center gap-3">
                    <button className="p-3 rounded-full hover:bg-gray-100 transition-colors duration-200 group flex-shrink-0">
                        <Mic className="w-5 h-5 text-gray-600 group-hover:text-indigo-500 transition-colors" />
                    </button>

                    <div className="flex-1 relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                            placeholder={isLoading ? "AI is thinking..." : "Type your message..."}
                            disabled={isLoading}
                            className="w-full border border-gray-300 rounded-full px-6 py-3 
                                     focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                                     shadow-sm transition-all duration-200 text-sm md:text-base
                                     placeholder-gray-500 bg-white disabled:bg-gray-50 disabled:cursor-not-allowed"
                        />
                    </div>

                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-3 rounded-full bg-gradient-to-r from-blue-500 to-indigo-600 
                                 hover:from-blue-600 hover:to-indigo-700 text-white shadow-md
                                 transition-all duration-200 hover:shadow-lg disabled:opacity-50 
                                 disabled:cursor-not-allowed disabled:hover:shadow-md
                                 transform hover:scale-105 active:scale-95 flex-shrink-0"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
