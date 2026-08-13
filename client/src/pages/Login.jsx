import React, { useState } from 'react';
import { api, setToken } from '../api';
import { toast } from '../components/Toast.jsx';

export default function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api.login(username.trim(), password);
      setToken(r.token);
      toast.success(`欢迎回来，${r.user.username}`);
      onLogin(r.user);
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="hero">
      <div className="hero-card">
        <div className="hero-logo">MR</div>
        <div className="hero-title">登录 Media Renamer</div>
        <div className="hero-sub">影视媒体识别与规范重命名</div>
        <form onSubmit={submit}>
          <div className="field">
            <label>用户名</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="管理员用户名" autoFocus />
          </div>
          <div className="field">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="密码" />
          </div>
          {err && <p style={{ color: '#d70015', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? '登录中…' : '登 录'}
          </button>
        </form>
      </div>
    </div>
  );
}
