import React, { useState } from 'react';
import { api, setToken } from '../api';
import { toast } from '../components/Toast.jsx';

export default function Setup({ onDone }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr('');
    if (username.trim().length < 2) return setErr('用户名至少 2 个字符');
    if (password.length < 6) return setErr('密码至少 6 位');
    if (password !== confirm) return setErr('两次输入的密码不一致');
    setBusy(true);
    try {
      const r = await api.setup(username.trim(), password);
      setToken(r.token);
      toast.success('管理员创建成功，欢迎使用');
      onDone(r.user);
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
        <div className="hero-title">欢迎使用 Media Renamer</div>
        <div className="hero-sub">首次启动，请创建管理员账号以完成初始化</div>
        <form onSubmit={submit}>
          <div className="field">
            <label>管理员用户名</label>
            <input className="input" value={username} onChange={e => setUsername(e.target.value)}
              placeholder="如 admin" autoFocus />
          </div>
          <div className="field">
            <label>密码</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="至少 6 位" />
          </div>
          <div className="field">
            <label>确认密码</label>
            <input className="input" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="再次输入密码" />
          </div>
          {err && <p style={{ color: '#d70015', fontSize: 13, marginBottom: 12 }}>{err}</p>}
          <button className="btn primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? '创建中…' : '创建管理员'}
          </button>
        </form>
      </div>
    </div>
  );
}
