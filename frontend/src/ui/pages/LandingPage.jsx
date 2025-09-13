import React from 'react'
import { Link } from 'react-router-dom'

const LandingPage = () => {
  return (
    <div className='h-screen w-screen'>
      <div className='app-header flex justify-center items-center h-[75%] bg-zinc-800 text-white'>
          <div className='pb-10 flex flex-col justify-center items-center'>
            <p className='text-4xl font-bold flex justify-center items-center mb-6 gap-4'>Your AI Personal <p className='text-5xl pb-2 bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent'> Assistant </p></p>
            <span className=' w-[75%] flex flex-wrap text-center'>Experience the future of productivity with an intelligent assistant that manages your tasks, conversations, and communications all in one beautiful interface.</span>
            <Link to="/app"><button className='mt-10 tracking-tight font-semibold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 px-5 py-2 rounded-xl '>Get Started</button></Link>
          </div>
        </div>
    </div>
  )
}

export default LandingPage
