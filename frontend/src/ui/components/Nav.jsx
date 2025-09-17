import { NavLink } from "react-router-dom";
import { Link } from "react-router-dom";   

export default function Nav() {
  return (
    <aside className="w-64 h-screen bg-gray-900 text-white flex flex-col p-4">
      <Link to="default"><h2 className="text-lg font-bold mb-6">Wednesday</h2></Link>
      <nav className="flex flex-col space-y-3">
        <NavLink
          to="Chat"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-gray-700 ${
              isActive ? "bg-gray-700 font-semibold" : ""
            }`
          }
        >
          Chat
        </NavLink>
        <NavLink
          to="TaskManager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-gray-700 ${
              isActive ? "bg-gray-700 font-semibold" : ""
            }`
          }
        >
          Task Manager
        </NavLink>
        <NavLink
          to="AutoMessager"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-gray-700 ${
              isActive ? "bg-gray-700 font-semibold" : ""
            }`
          }
        >
          Auto Messager
        </NavLink>
        <NavLink
          to="Voice"
          className={({ isActive }) =>
            `px-3 py-2 rounded-md hover:bg-gray-700 ${
              isActive ? "bg-gray-700 font-semibold" : ""
            }`
          }
        >
          Voice Component
        </NavLink>
      </nav>
    </aside>
  );
}
