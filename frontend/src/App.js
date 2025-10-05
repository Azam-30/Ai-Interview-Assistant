import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import Interviewee from './pages/Interviewee';
import Interviewer from './pages/Interviewer';
import './App.css';
import 'antd/dist/reset.css';

// Import the custom hook
import useParticlesLoad from './hooks/useParticlesLoad'; 

function App() {
    // 1. Run the custom hook to load particles.js from CDN
    useParticlesLoad(); 

    return (
        <Router>
            <div className="app">
                
                {/* 1. The Particles Container (ID must match hook initialization) */}
                <div 
                    id="particles-js" 
                    style={{
                        position: "fixed", 
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: "100%",
                        zIndex: 1, 
                        // Set background color to match the body, just in case
                        backgroundColor: "#3E1E68" 
                    }}
                ></div>
                
                {/* 2. Content Layer */}
                <header className="header" style={{zIndex: 10}}>
                    <h1>AI Interview Assistant <span style={{fontWeight:400, fontSize:'1.1rem', opacity:0.7}}>(Demo)</span></h1>
                    <nav>
                        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>
                            Interviewee
                        </NavLink>
                        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
                            Interviewer
                        </NavLink>
                    </nav>
                </header>
                <main style={{zIndex: 5}}>
                    <Routes>
                        <Route path="/" element={<Interviewee />} />
                        <Route path="/dashboard" element={<Interviewer />} />
                    </Routes>
                </main>
            </div>
        </Router>
    );
}
export default App;