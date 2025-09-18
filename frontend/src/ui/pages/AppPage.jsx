import React, { useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Nav from '../components/Nav';
import Topbar from '../components/TopBar';

const AppPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get('openChat') === 'true') {
            navigate('Chat', { replace: true });
        }
    }, [location, navigate]);
    return (
    <div className="flex h-screen overflow-hidden bg-black">
            {/* Sidebar */}
            <Nav />

            {/* Main content */}
            <main className="flex-1 flex flex-col bg-black">
                <Topbar />
                <div className="flex-1 overflow-hidden">
                    <Outlet />
                </div>
            </main>
        </div>
    )
}

export default AppPage
