import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { toast } from '../components/Toast.jsx';

const LEVEL_STYLES = {
  debug: { background: 'rgba(0,0,0,0.05)', color: 'var(--text-3)' },
  info: { background: 'rgba(0,113,227,0.1)', color: '#0066cc' },
  warn: { background: 'rgba(255,149,0,0.15)', color: '#c34e00' },
  error: { background: 'rgba(255,59,48,0.12)', color: '#d70015' },
};

function fmtTime(ts) {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts || '';
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  } catch {
    return ts || '';
  }
}

export default function Logs() {
  const [tab, setTab] = useState('runtime'); // runtime | rename
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [logs, setLogs] = useState([]);
  const [renameLogs, setRenameLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  async function loadRuntime() {
    setLoading(true);
    try {
      const r = await api.getLogs({ level, q, limit: 400 });
      setLogs(r.logs || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  async function loadRename() {
    try {
      const r = await api.getRenameLogs({ limit: 200 });
      setRenameLogs(r.logs || []);
    } catch (e) { toast.error(e.message); }
  }

  // 筛选条件变化时重新加载
  useEffect(() => {
    if (tab === 'runtime') loadRuntime();
  }, [level, q, tab]);

  // 自动刷新（5s）
  useEffect(() => {
    if (!auto) return;
    timer.current = setInterval(() => {
      if (tab === 'runtime') loadRuntime();
      else loadRename();
    }, 5000);
    return () => clearInterval(timer.current);
  }, [auto, tab, level, q]);

  async function clearAll() {
    if (!window.confirm('确定清空全部运行日志？此操作不可恢复。')) return;
    try {
      await api.clearLogs();
      setLogs([]);
      toast.success('运行日志已清空');
    } catch (e) { toast.error(e.message); }
  }

  const levelTag = l => (
    <span className="tag" style={{ ...(LEVEL_STYLES[l.level] || LEVEL_STYLES.debug), minWidth: 52, justifyContent: 'center' }}>
      {String(l.level || 'info').toUpperCase()}
    </span>
  );

  const statusStyle = s => {
    if (s === 'success' || s === 'ok' || s === 'done') return { background: 'rgba(48,209,88,0.12)', color: '#248a3d' };
    if (s === 'failed' || s === 'error' || s === 'skipped') return { background: 'rgba(255,59,48,0.12)', color: '#d70015' };
    return { background: 'rgba(0,0,0,0.05)', color: 'var(--text-2)' };
  };

  return (
    <div className="container read">
      <div className="page-head">
        <div>
          <h1 className="page-title">日志</h1>
          <p className="page-sub">运行日志与重命名记录，用于排查匹配 / 刮削 / 重命名问题</p>
        </div>
      </div>

      <div className="toolbar" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div className="segmented" style={{ flexShrink: 0 }}>
          <button className={tab === 'runtime' ? 'active' : ''} onClick={() => setTab('runtime')}>运行日志</button>
          <button className={tab === 'rename' ? 'active' : ''} onClick={() => setTab('rename')}>重命名记录</button>
        </div>
        {tab === 'runtime' && (
          <>
            <select className="select" style={{ width: 110 }} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="">全部级别</option>
              <option value="debug">debug</option>
              <option value="info">info</option>
              <option value="warn">warn</option>
              <option value="error">error</option>
            </select>
            <input className="input" style={{ width: 200 }} placeholder="搜索关键词…"
              value={q} onChange={e => setQ(e.target.value)} />
            <button className="btn" onClick={loadRuntime} disabled={loading}>
              {loading ? <><span className="spin" /> 刷新中…</> : '🔄 刷新'}
            </button>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
              <input type="checkbox" className="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} />
              自动刷新 (5s)
            </label>
            <div className="nav-spacer" style={{ flex: 1 }} />
            <button className="btn danger" onClick={clearAll}>🗑 清空日志</button>
          </>
        )}
        {tab === 'rename' && (
          <button className="btn" onClick={loadRename}>🔄 刷新</button>
        )}
      </div>

      {tab === 'runtime' ? (
        <div className="panel" style={{ padding: 0 }}>
          <div className="row-list" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {logs.length === 0 && <div className="empty"><div className="empty-icon">📄</div>暂无日志</div>}
            {logs.map((l, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', padding: '9px 18px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)', flexShrink: 0, marginTop: 3, width: 96 }}>{fmtTime(l.ts)}</span>
                {levelTag(l)}
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)', flexShrink: 0, marginTop: 3, width: 64 }}>[{l.scope || 'app'}]</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5, wordBreak: 'break-all' }}>{l.msg}</div>
                  {l.extra != null && (
                    <div style={{ fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--text-3)', marginTop: 4, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                      {typeof l.extra === 'string' ? l.extra : JSON.stringify(l.extra)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ padding: 0 }}>
          <div className="row-list" style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            {renameLogs.length === 0 && <div className="empty"><div className="empty-icon">📄</div>暂无重命名记录</div>}
            {renameLogs.map((r, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start', padding: '10px 18px' }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text-3)', flexShrink: 0, marginTop: 3, width: 96 }}>{fmtTime(r.created_at + 'Z')}</span>
                <span className="tag" style={{ ...statusStyle(r.status), minWidth: 60, justifyContent: 'center' }}>{r.status || 'unknown'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: 'var(--mono)', wordBreak: 'break-all', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text-3)' }}>旧:</span> {r.old_path}
                  </div>
                  {r.new_path && (
                    <div style={{ fontSize: 13, fontFamily: 'var(--mono)', wordBreak: 'break-all', lineHeight: 1.5, marginTop: 2 }}>
                      <span style={{ color: '#248a3d' }}>新:</span> {r.new_path}
                    </div>
                  )}
                  {r.message && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{r.message}</div>}
                </div>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text-4)', flexShrink: 0 }}>#{r.id} item:{r.item_id}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
