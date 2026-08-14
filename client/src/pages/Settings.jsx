import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from '../components/Toast.jsx';
import DirPicker from '../components/DirPicker.jsx';

export default function Settings() {
  const [form, setForm] = useState({
    tmdb_api_key: '', tmdb_base_url: '', tmdb_timeout: 15000, tmdb_proxy: '',
    media_dirs: [], rename_mode: 'file',
  });
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [dirPicker, setDirPicker] = useState(null);

  useEffect(() => {
    api.getSettings().then(s => {
      setForm({
        tmdb_api_key: s.has_tmdb_key ? s.tmdb_api_key : '',
        tmdb_base_url: s.tmdb_base_url || '',
        tmdb_timeout: s.tmdb_timeout || 15000,
        tmdb_proxy: s.tmdb_proxy || '',
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
    setTestResult(null);
    try {
      await api.saveSettings(form);
      toast.success('设置已保存');
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function testConn() {
    setTesting(true);
    setTestResult(null);
    try {
      // 先保存再测试，确保后端读到最新值
      await api.saveSettings(form);
      const r = await api.tmdbTest();
      setTestResult(r);
      if (r.ok) toast.success(`连接成功（${r.cost}ms · ${r.proxy || '直连'}）`);
      else toast.error(r.message || '连接失败');
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
      toast.error(e.message);
    } finally { setTesting(false); }
  }

  if (!loaded) return <div className="container"><span className="spin" style={{ width: 22, height: 22, margin: '40px auto', display: 'block' }} /></div>;

  return (
    <div className="container read">
      <div className="page-head">
        <div>
          <h1 className="page-title">设置</h1>
          <p className="page-sub">TMDB 凭据、网络、媒体目录与命名规则</p>
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

          <div className="field">
            <label>API 地址（可选镜像）</label>
            <input className="input" value={form.tmdb_base_url}
              placeholder="留空使用官方 https://api.themoviedb.org/3"
              onChange={e => setForm({ ...form, tmdb_base_url: e.target.value })} />
            <p className="muted" style={{ marginTop: 6 }}>可填写第三方 TMDB API 反代/镜像地址，无需 https 前缀也可。</p>
          </div>

          <div className="field">
            <label>HTTP 代理（可选）</label>
            <input className="input" value={form.tmdb_proxy}
              placeholder="如 http://127.0.0.1:7890 — 留空则直连"
              onChange={e => setForm({ ...form, tmdb_proxy: e.target.value })} />
            <p className="muted" style={{ marginTop: 6 }}>
              Node 18+ 的 fetch 默认不走系统代理。若 NAS 无法直连 TMDB，在此填写代理地址即可。
              也支持环境变量 <code>HTTPS_PROXY</code> / <code>HTTP_PROXY</code> 兜底。
            </p>
          </div>

          <div className="field">
            <label>请求超时（毫秒）</label>
            <input className="input" type="number" min="3000" max="60000" step="1000"
              value={form.tmdb_timeout}
              onChange={e => setForm({ ...form, tmdb_timeout: parseInt(e.target.value, 10) || 15000 })} />
            <p className="muted" style={{ marginTop: 6 }}>范围 3000–60000ms，默认 15000ms</p>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 4 }}>
            <button className="btn" onClick={testConn} disabled={testing}>
              {testing ? <><span className="spin" /> 测试中…</> : '🔌 测试连接'}
            </button>
            {testResult && (
              <div style={{ fontSize: 13 }}>
                {testResult.ok
                  ? <span style={{ color: '#248a3d' }}>✓ {testResult.cost}ms · {testResult.proxy || '直连'}</span>
                  : <span style={{ color: '#d70015' }}>✕ {testResult.message}</span>}
              </div>
            )}
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
