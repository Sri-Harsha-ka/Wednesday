
import { UserCircleIcon } from "@heroicons/react/24/outline";
import React, { useState, useEffect } from "react";

export default function Topbar() {
  const [showModal, setShowModal] = useState(false);
  const [email, setEmail] = useState("");
  const [input, setInput] = useState("");

  const handleSignOut = () => {
    setEmail("");
    localStorage.removeItem("user_email");
    setShowModal(false);
  };

  useEffect(() => {
    const saved = localStorage.getItem("user_email");
    if (saved) setEmail(saved);
  }, []);

  const handleSignIn = (e) => {
    e.preventDefault();
    if (input && input.includes("@")) {
      setEmail(input);
      localStorage.setItem("user_email", input);
      setShowModal(false);
    }
  };

  return (
    <header className="flex items-center justify-end px-6 py-3 bg-black shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
      <div className="flex items-center space-x-6">
        <button className="hover:text-cyan-400" onClick={() => setShowModal(true)}>
          <UserCircleIcon className="h-6 w-6 cursor-pointer text-white" />
        </button>
        {email && (
          <span className="ml-2 text-cyan-300 text-sm font-medium flex items-center gap-2">
            {email}
            <button
              className="ml-1 px-2 py-1 rounded bg-zinc-800 text-cyan-400 border border-cyan-700 hover:bg-zinc-700 text-xs transition-all"
              onClick={handleSignOut}
            >
              Sign Out
            </button>
          </span>
        )}
      </div>

      {/* Modal for sign in */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-zinc-900 rounded-xl p-8 shadow-2xl border border-cyan-700 w-80 flex flex-col items-center">
            <h2 className="text-lg font-bold text-cyan-300 mb-4">Sign in with Email</h2>
            {email ? (
              <>
                <div className="text-cyan-200 mb-4">Signed in as <span className="font-semibold">{email}</span></div>
                <button
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all mb-2"
                  onClick={handleSignOut}
                >
                  Sign Out
                </button>
                <button
                  className="w-full py-2 rounded-lg bg-zinc-800 text-cyan-300 border border-cyan-700 hover:bg-zinc-700 transition-all"
                  onClick={() => setShowModal(false)}
                >
                  Close
                </button>
              </>
            ) : (
              <form onSubmit={handleSignIn} className="w-full flex flex-col items-center">
                <input
                  type="email"
                  className="w-full px-4 py-2 rounded-lg bg-zinc-800 border border-cyan-700 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 mb-4"
                  placeholder="Enter your email"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  className="w-full mt-2 py-2 rounded-lg bg-zinc-800 text-cyan-300 border border-cyan-700 hover:bg-zinc-700 transition-all"
                  onClick={() => setShowModal(false)}
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
