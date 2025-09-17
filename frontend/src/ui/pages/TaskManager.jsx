import { Outlet, NavLink } from "react-router-dom";

function TaskManager() {
  return (
    <div className="h-full w-full flex flex-col">
      {/* Top navigation for TaskManager subsections */}
      <nav className="flex gap-4 p-4 border-b shadow">
        <NavLink 
          to="ToDo" 
          className={({ isActive }) => isActive ? "font-bold text-blue-500" : ""}
        >
          ToDo
        </NavLink>
        <NavLink 
          to="Calendar" 
          className={({ isActive }) => isActive ? "font-bold text-blue-500" : ""}
        >
            Calendar
        </NavLink>
        <NavLink 
          to="Reminders" 
          className={({ isActive }) => isActive ? "font-bold text-blue-500" : ""}
        >
          Reminders
        </NavLink>
        <NavLink 
          to="Notes" 
          className={({ isActive }) => isActive ? "font-bold text-blue-500" : ""}
        >
          Notes
        </NavLink>
      </nav>

      {/* Subsection content */}
      <div className="flex-1 overflow-y-auto p-4">
        <Outlet /> {/* renders the subsection */}
      </div>
    </div>
  );
}

export default TaskManager;
