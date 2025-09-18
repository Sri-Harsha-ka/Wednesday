import { BellIcon, Cog6ToothIcon, UserCircleIcon } from "@heroicons/react/24/outline";

export default function Topbar() {
  return (
    <header className="flex items-center justify-end px-6 py-3 bg-black shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">

      {/* Right side (icons) */}
      <div className="flex items-center space-x-6">
        <button className="hover:text-indigo-600">
          <BellIcon className="h-6 w-6 cursor-pointer text-white" />
        </button>
        <button className="hover:text-indigo-600">
          <Cog6ToothIcon className="h-6 w-6 cursor-pointer text-white" />
        </button>
        <button className="hover:text-indigo-600">
          <UserCircleIcon className="h-6 w-6 cursor-pointer text-white" />
        </button>
      </div>
    </header>
  );
}
