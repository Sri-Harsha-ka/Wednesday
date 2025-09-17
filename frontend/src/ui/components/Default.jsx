import React from 'react'
import { Link } from 'react-router-dom';

const Default = () => {

    const greetings = [
        "Welcome back! 👋",
        "Good to see you again 😊",
        "Hello there! 🚀",
        "Hope you're having a great day 🌞",
        "Hey, ready to get started? 💡",
        "What's up? 👀",
        "Glad you're here 🙌",
        "Let's make something awesome today 💻",
        "Your workspace is waiting ✨",
        "Nice to see you again 🔥",
        "Let's get things done ✅",
        "Back to business! 📊",
        "You’re doing amazing 🤩",
        "Keep up the great work 💪",
        "Let’s dive right in 🌊",
        "The journey continues 🚴",
        "Let’s build something cool 🛠️",
        "Another day, another win 🎉",
        "Focused and ready? 🎯",
        "It’s go time ⏱️",
        "Welcome to your dashboard 📋",
        "Your ideas matter 💡",
        "Time to create magic ✨",
        "Always moving forward ⏩",
        "Success starts here 🌟"
    ];

    const responses = [
        "Let's chat 💬",
        "Open conversation 🔓",
        "Take me to chat 🗨️",
        "Start chatting 🚀",
        "Go to messages 📩",
        "Let's talk 👂",
        "Jump into chat 💡",
        "Continue in chat 🔥",
        "Ask me something ❓",
        "Begin a new chat ➕",
        "Take me there 🏃",
        "Connect now 🌐",
        "Show me the chat window 🖥️",
        "Start a conversation 🗣️",
        "Head over to chat 📲",
        "Open the inbox 📥",
        "Tap to chat 👉",
        "Let's brainstorm 💭",
        "Go chat now ⚡",
        "Ready to talk? 🎤",
        "Chat time ⏱️",
        "Dive into chat 🌊",
        "Let's discuss 💬",
        "Your chat is waiting ✨",
        "Start messaging ✉️"
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return (
        <div className='flex items-center justify-center h-96 text-2xl font-semibold'>
            <div>
                <p className='text-4xl '>{randomGreeting}</p>

                <div className='text-center pt-10'>
                    <Link to="/app/Chat"><p className='text-blue-900'>{randomResponse}</p></Link>
                </div>
            </div>
        </div>
    )
}

export default Default
