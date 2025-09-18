import { NavLink } from "react-router-dom";
import { Link } from "react-router-dom";   

export default function Nav() {
  return (
    <aside className="w-72 h-screen bg-zinc-900 text-white flex flex-col p-4">
      <Link to="default"><h2 className="text-lg font-bold mb-6">Wednesday</h2></Link>
      <nav className="flex flex-col space-y-3">
        <NavLink
          to="Chat"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-zinc-700 text-2xl tracking-wider ${
              isActive ? "bg-zinc-800 font-semibold" : ""
            }`
          }
        >
          Chat
        </NavLink>
        <NavLink
          to="TaskManager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-zinc-700 text-2xl tracking-wider ${
              isActive ? "bg-zinc-800 font-semibold" : ""
            }`
          }
        >
          Task Manager
        </NavLink>
        <NavLink
          to="AutoMessager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-zinc-700 text-2xl tracking-wider ${
              isActive ? "bg-zinc-800 font-semibold" : ""
            }`
          }
        >
          Auto Messager
        </NavLink>
        <NavLink
          to="Voice"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-zinc-700 text-2xl tracking-wider ${
              isActive ? "bg-zinc-800 font-semibold" : ""
            }`
          }
        >
          Ai Voice
        </NavLink>
      </nav>
    </aside>
  );
}
