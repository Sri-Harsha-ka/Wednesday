 import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const LandingPage = () => {
  const [animate, setAnimate] = useState(false);
  const navigate = useNavigate();
  const handleAssistantClick = () => {
    setAnimate(true);
    setTimeout(() => {
      navigate('/?openChat=true', { replace: true });
    }, 700); // Animation duration
  };
  return (
    <div className='h-screen w-screen relative overflow-hidden bg-black'>
      {/* Glassmorphism background effect */}
      <div className="absolute inset-0 z-0 pointer-events-none" style={{background: "radial-gradient(ellipse at 60% 20%, rgba(6,182,212,0.10) 0%, transparent 70%), radial-gradient(ellipse at 20% 80%, rgba(139,92,246,0.10) 0%, transparent 70%)"}}></div>
  <div className='app-header flex justify-center items-center h-[75%] bg-zinc-900/80 text-white shadow-cyan-400/20 shadow-2xl backdrop-blur-lg border-b-2 border-cyan-900/60 z-10'>
  <div className='pb-10 flex flex-col justify-center items-center z-10'>
          <p className='text-4xl font-bold flex justify-center items-center mb-6 gap-4 text-cyan-300 drop-shadow-cyan-400/40 drop-shadow-lg'>
            Your AI Personal
            <span
              className={`text-5xl pb-2 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 bg-clip-text text-transparent cursor-pointer transition-transform duration-700 ${animate ? 'translate-y-16 scale-125 shadow-cyan-400/40' : ''}`}
              onClick={handleAssistantClick}
              title="Go to Chat"
            >
              Assistant
            </span>
          </p>
          <span className='w-[75%] flex flex-wrap text-center text-cyan-200/90 bg-zinc-900/60 rounded-xl p-4 mt-4 shadow-cyan-400/10 shadow-lg backdrop-blur-md border border-cyan-900/40'>Experience the future of productivity with an intelligent assistant that manages your tasks, conversations, and communications all in one beautiful interface.</span>
          <button
            className='mt-10 tracking-tight font-semibold bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-500 px-5 py-2 rounded-xl text-white shadow-cyan-400/30 shadow-lg hover:shadow-cyan-400/60 hover:scale-105 transition-all duration-200 border-2 border-cyan-600'
            onClick={() => navigate('/app')}
          >
            Get Started
          </button>
        </div>
      </div>
      <style>{`
        .translate-y-16 {
          transform: translateY(4rem) scale(1.25);
        }
      `}</style>
    </div>
  )
}

export default LandingPage
