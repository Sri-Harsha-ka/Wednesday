import { Route, Routes, Navigate } from 'react-router-dom';
import LandingPage from './pages/LandingPage';
import AppPage from './pages/AppPage';
import Chat from './components/Chat';
import Default from './components/Default';
import ToDo from './components/ToDo';
import TaskManager from './pages/TaskManager';
import Voice from './components/Voice';

function App() {

  return (
    <>
      <div className='app-container h-screen w-screen'>
        <Routes>
          <Route path='/landingPage' element={<LandingPage />} />
          <Route path='/' element={<AppPage />}>

            <Route index element={<Navigate to="default" replace/>} />

            <Route path='default' element={<Default />} />
            <Route path='Chat' element={<Chat />} />

            <Route path='TaskManager' element={<TaskManager />}>
              <Route index element={<ToDo />} />
              <Route path='ToDo' element={<ToDo />} />
              <Route path='Calendar' element={<div>Calendar Component</div>} />
              <Route path='Reminders' element={<div>Reminders Component</div>} />
              <Route path='Notes' element={<div>Notes Component</div>} />
            </Route>
            <Route path='AutoMessager' element={<div>Auto Messager Component</div>} />
            <Route path='Voice' element={<Voice/>} />

          </Route>
          <Route path='*' element={<div>404 Not Found</div>} />
        </Routes>

      </div>
    </>
  )
}

export default App
