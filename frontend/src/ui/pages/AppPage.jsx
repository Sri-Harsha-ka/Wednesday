import React from 'react'
import { Outlet } from 'react-router-dom';
import Nav from '../components/Nav';
import Topbar from '../components/TopBar';

const AppPage = () => {
    return (
        <div className="flex h-screen">
            {/* Sidebar */}
            <Nav />

            {/* Main content */}
            <main className="flex-1 pb-6 bg-gray-100 overflow-y-auto">
                <Topbar />
                <div>
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default AppPage
