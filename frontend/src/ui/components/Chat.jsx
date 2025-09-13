import React, { useState } from "react";
import { Send, Mic } from "lucide-react";

const Chat = () => {
    const [messages, setMessages] = useState([
        { from: "bot", text: "Hello! How can I help you today?" },
    ]);
    const [input, setInput] = useState("");

    const handleSend = () => {
        if (!input.trim()) return;

        // Add user message
        setMessages([...messages, { from: "user", text: input }]);
        setInput("");

        // Fake bot response (for now)
        setTimeout(() => {
            setMessages((prev) => [
                ...prev,
                { from: "bot", text: "Got it 👍 (this is a sample response)" },
            ]);
        }, 800);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Chat history */}
            <div className="flex-1 overflow-y-auto px-40 py-28 space-y-3">
                {messages.map((msg, idx) => (
                    <div
                        key={idx}
                        className={`flex ${msg.from === "user" ? "justify-end" : "justify-start"
                            }`}
                    >
                        <div
                            className={`px-4 py-2 rounded-2xl max-w-xs ${msg.from === "user"
                                    ? "bg-indigo-500 text-white"
                                    : "bg-gray-200 text-gray-800"
                                }`}
                        >
                            {msg.text}
                        </div>
                    </div>
                ))}
            </div>

            {/* Input bar */}
            <div className="p-3 border-t bg-white flex items-center gap-2 fixed bottom-0 left-64 right-0">
                <button className="p-2 rounded-full hover:bg-gray-100">
                    <Mic className="w-5 h-5 text-gray-600" />
                </button>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    placeholder="Type your message..."
                    className="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />

                <button
                    onClick={handleSend}
                    className="p-2 rounded-full bg-indigo-500 hover:bg-indigo-600 text-white"
                >
                    <Send className="w-5 h-5" />
                </button>
            </div>
        </div>
    );
};

export default Chat;
