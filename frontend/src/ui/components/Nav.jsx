import { NavLink } from "react-router-dom";
import { Link } from "react-router-dom";   

export default function Nav() {
  return (
    <aside className="w-72 h-screen bg-zinc-900 text-white flex flex-col p-4">
  <Link to="default"><h2 className="text-5xl font-extrabold mb-8 tracking-widest italic" style={{fontFamily: 'Permanent Marker, cursive', color: '#ef4444', letterSpacing: '0.28em', textShadow: '0 4px 24px #991b1b, 0 1px 0 #fff', fontStyle: 'italic', transform: 'skew(-12deg)'}}>OJAS</h2></Link>
      <nav className="flex flex-col space-y-3">
        <NavLink
          to="Chat"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-cyan-900/60 text-2xl tracking-widest font-mono transition-all duration-200 ${
              isActive ? "bg-cyan-900/80 text-cyan-300 shadow-cyan-400/30 shadow-lg font-extrabold border-2 border-cyan-500" : "text-cyan-200 border border-cyan-800"
            }`
          }
        >
          CHAT
        </NavLink>
        <NavLink
          to="TaskManager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-cyan-900/60 text-2xl tracking-widest font-mono transition-all duration-200 ${
              isActive ? "bg-cyan-900/80 text-cyan-300 shadow-cyan-400/30 shadow-lg font-extrabold border-2 border-cyan-500" : "text-cyan-200 border border-cyan-800"
            }`
          }
        >
          TASK MANAGER
        </NavLink>
        <NavLink
          to="AutoMessager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-cyan-900/60 text-2xl tracking-widest font-mono transition-all duration-200 ${
              isActive ? "bg-cyan-900/80 text-cyan-300 shadow-cyan-400/30 shadow-lg font-extrabold border-2 border-cyan-500" : "text-cyan-200 border border-cyan-800"
            }`
          }
        >
          AUTO MESSAGER
        </NavLink>
        <NavLink
          to="Voice"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-cyan-900/60 text-2xl tracking-widest font-mono transition-all duration-200 ${
              isActive ? "bg-cyan-900/80 text-cyan-300 shadow-cyan-400/30 shadow-lg font-extrabold border-2 border-cyan-500" : "text-cyan-200 border border-cyan-800"
            }`
          }
        >
          AI VOICE
        </NavLink>
      </nav>
    </aside>
  );
}
