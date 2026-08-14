import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Library from './pages/Library.jsx';
import Settings from './pages/Settings.jsx';
import Logs from './pages/Logs.jsx';
import { ToastHost, toast } from './components/Toast.jsx';

function Shell({ user, onLogout }) {
  const nav = useNavigate();
  return (
    <div>
      <nav className="nav">
        <div className="nav-inner">
          <div className="nav-brand"><span className="dot" />Media Renamer</div>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>仪表盘</NavLink>
            <NavLink to="/library" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>媒体库</NavLink>
            <NavLink to="/logs" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>日志</NavLink>
            <NavLink to="/settings" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>设置</NavLink>
          </div>
          <div className="nav-spacer" />
          <span className="nav-user">{user?.username}</span>
          <button className="nav-btn" onClick={() => { setToken(null); nav('/login'); onLogout(); }}>退出</button>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/library" element={<Library />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
      <ToastHost />
    </div>
  );
}

export default function App() {
  const [boot, setBoot] = useState('loading'); // loading | setup | login | app
  const [user, setUser] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.authStatus();
        if (!s.initialized) { setBoot('setup'); return; }
        const t = getToken();
        if (!t) { setBoot('login'); return; }
        try {
          const me = await api.me();
          setUser(me.user);
          setBoot('app');
        } catch {
          setToken(null);
          setBoot('login');
        }
      } catch {
        setBoot('login');
      }
    })();
  }, []);

  if (boot === 'loading') {
    return <div className="hero"><span className="spin" style={{ width: 26, height: 26 }} /></div>;
  }
  if (boot === 'setup') return <Setup onDone={(u) => { setUser(u); setBoot('app'); }} />;
  if (boot === 'login') return <Login onLogin={(u) => { setUser(u); setBoot('app'); }} />;
  return <Shell user={user} onLogout={() => setUser(null)} />;
}
