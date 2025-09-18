import React from 'react'
import { Outlet } from 'react-router-dom';
import Nav from '../components/Nav';
import Topbar from '../components/TopBar';

const AppPage = () => {
    return (
        <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <Nav />

            {/* Main content */}
            <main className="flex-1 flex flex-col bg-gray-100">
                <Topbar />
                <div className="flex-1 overflow-hidden">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default AppPage
