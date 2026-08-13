import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { toast } from '../components/Toast.jsx';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [scanning, setScanning] = useState(false);
  const nav = useNavigate();

  async function load() {
    try {
      const [s, l] = await Promise.all([api.stats(), api.logs()]);
      setStats(s);
      setLogs(l.logs);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(); }, []);

  function startScan() {
    setScanning(true);
    api.scan().then(r => {
      toast.success(r.message);
      // 轮询扫描状态
      const iv = setInterval(async () => {
        const st = await api.scanStatus();
        if (!st.running) {
          clearInterval(iv);
          setScanning(false);
          load();
          toast.success(st.message);
        }
      }, 800);
    }).catch(e => { setScanning(false); toast.error(e.message); });
  }

  const cards = stats ? [
    { label: '电影', num: stats.movies, cls: 'accent' },
    { label: '剧集', num: stats.tv, cls: 'accent' },
    { label: '已匹配 TMDB', num: stats.matched, cls: 'live' },
    { label: '已重命名', num: stats.renamed, cls: 'live' },
    { label: '待匹配', num: stats.pending, cls: stats.pending ? 'warn' : '' },
    { label: '失败', num: stats.errors, cls: stats.errors ? 'warn' : '' },
  ] : [];

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1 className="page-title">仪表盘</h1>
          <p className="page-sub">媒体库概览与最近操作</p>
        </div>
        <button className="btn primary" onClick={startScan} disabled={scanning}>
          {scanning ? <><span className="spin" /> 扫描中…</> : '🔄 扫描媒体库'}
        </button>
      </div>

      <div className="stats-grid">
        {cards.map(c => (
          <div className="stat" key={c.label}>
            <div className={'stat-num ' + c.cls}>{c.num}</div>
            <div className="stat-label">{c.label}</div>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-title">最近重命名日志</div>
        <div className="row-list">
          {logs.length === 0 && <div className="empty"><div className="empty-icon">📄</div>暂无重命名记录</div>}
          {logs.slice(0, 10).map(l => (
            <div className="row" key={l.id}>
              <span className={'tag ' + (l.status === 'success' ? 'ok' : 'warn')}>{l.status === 'success' ? '成功' : '失败'}</span>
              <div className="row-main">
                <div className="row-sub">{l.old_path}</div>
                {l.new_path && <div className="row-sub" style={{ color: '#248a3d' }}>→ {l.new_path}</div>}
              </div>
              <span className="muted">{l.created_at}</span>
            </div>
          ))}
        </div>
        {logs.length > 0 && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--hairline)' }}>
            <button className="btn ghost sm" onClick={() => nav('/library')}>前往媒体库处理 →</button>
          </div>
        )}
      </div>
    </div>
  );
}
