import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from '../components/Toast.jsx';
import DirPicker from '../components/DirPicker.jsx';

export default function Settings() {
  const [form, setForm] = useState({ tmdb_api_key: '', media_dirs: [], rename_mode: 'file' });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirPicker, setDirPicker] = useState(null); // 正在浏览的目录 index

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({
        tmdb_api_key: s.has_tmdb_key ? s.tmdb_api_key : '',
        media_dirs: s.media_dirs,
        rename_mode: s.rename_mode,
      });
      setLoaded(true);
    }).catch(e => toast.error(e.message));
  }, []);

  function updateDir(i, patch) {
    const dirs = form.media_dirs.map((d, idx) => idx === i ? { ...d, ...patch } : d);
    setForm({ ...form, media_dirs: dirs });
  }

  async function save() {
    setBusy(true);
    try {
      await api.saveSettings(form);
      toast.success('设置已保存');
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (!loaded) return <div className="container"><span className="spin" style={{ width: 22, height: 22, margin: '40px auto', display: 'block' }} /></div>;

  return (
    <div className="container read">
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">TMDB 凭据、媒体目录与命名规则</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">TMDB 配置</div>
        <div className="panel-body">
          <div className="field">
            <label>TMDB API Key（v3 auth）</label>
            <input className="input" type="password" value={form.tmdb_api_key}
              placeholder="在 https://www.themoviedb.org/settings/api 获取"
              onChange={e => setForm({ ...form, tmdb_api_key: e.target.value })} />
            <p className="muted" style={{ marginTop: 6 }}>用于电影/剧集元数据识别，可在官方免费申请</p>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">媒体目录</div>
        <div className="panel-body">
          {form.media_dirs.length === 0 && (
            <div className="empty"><div className="empty-icon">📁</div>尚未添加媒体目录</div>
          )}
          {form.media_dirs.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 12, alignItems: 'center' }}>
              <div className="input" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'default', overflow: 'hidden' }}>
                <span style={{ opacity: 0.7 }}>📁</span>
                <span style={{ fontSize: 14, fontFamily: 'var(--mono)', color: d.path ? 'var(--text)' : 'var(--text-4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {d.path || '未选择目录'}
                </span>
              </div>
              <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => setDirPicker(i)}>浏览…</button>
              <select className="select" style={{ width: 120, flexShrink: 0 }} value={d.type}
                onChange={e => updateDir(i, { type: e.target.value })}>
                <option value="movie">电影</option>
                <option value="tv">剧集</option>
              </select>
              <button className="btn danger sm" style={{ flexShrink: 0 }}
                onClick={() => setForm({ ...form, media_dirs: form.media_dirs.filter((_, idx) => idx !== i) })}>删除</button>
            </div>
          ))}
          <button className="btn sm" onClick={() => setForm({ ...form, media_dirs: [...form.media_dirs, { path: '', type: 'movie' }] })}>
            ＋ 添加目录
          </button>
          <p className="muted" style={{ marginTop: 10 }}>目录类型决定重命名时按电影或剧集规范处理（full 模式下电影/剧集分别归入对应类型目录）。</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">命名规则</div>
        <div className="panel-body">
          <div className="field">
            <label>重命名模式</label>
            <div className="segmented">
              <button className={form.rename_mode === 'file' ? 'active' : ''}
                onClick={() => setForm({ ...form, rename_mode: 'file' })}>仅重命名文件</button>
              <button className={form.rename_mode === 'full' ? 'active' : ''}
                onClick={() => setForm({ ...form, rename_mode: 'full' })}>Emby 完整目录结构</button>
            </div>
            <p className="muted" style={{ marginTop: 8 }}>
              <b>仅重命名文件</b>：在原目录原地改名（安全）。<br />
              <b>Emby 完整结构</b>：按 Emby 官方规范整理，如
              <code> 电影\Avatar (2009)\Avatar (2009) [tmdbid=19995].mkv </code>、
              <code> 剧集\Glee (2009)\Season 1\Glee S01E01 - Pilot.mkv</code>
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
        <button className="btn primary" onClick={save} disabled={busy}>{busy ? '保存中…' : '保存设置'}</button>
      </div>

      {dirPicker !== null && (
        <DirPicker
          initial={form.media_dirs[dirPicker]?.path}
          onSelect={p => { updateDir(dirPicker, { path: p }); setDirPicker(null); }}
          onClose={() => setDirPicker(null)}
        />
      )}
    </div>
  );
}
