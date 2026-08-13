import React, { useEffect, useState, useRef } from 'react';
import { api } from '../api';
import { toast } from '../components/Toast.jsx';

const POSTER = (p) => p ? `https://image.tmdb.org/t/p/w92${p}` : null;

/* ── 手动匹配弹窗 ── */
function MatchModal({ item, onClose, onMatched }) {
  const [q, setQ] = useState(item.name || '');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState(false);

  async function doSearch() {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await api.search(q.trim(), item.type, item.year || '');
      setResults(r.results);
    } catch (e) { toast.error(e.message); }
    finally { setSearching(false); }
  }

  useEffect(() => { doSearch(); }, []); // 初始自动搜索

  async function confirm() {
    if (!selected) return toast.error('请选择一个结果');
    setBusy(true);
    try {
      const r = await api.match(item.id, selected.id, selected.kind);
      toast.success('匹配成功');
      onMatched(r.item);
      onClose();
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">手动匹配</div>
        <div className="modal-sub">
          {item.type === 'movie' ? '电影' : '剧集'} · <span className="path-fade">{item.name}</span>
          {item.year && <> · {item.year}</>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input className="input" value={q} onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="搜索 TMDB…" />
          <button className="btn primary" onClick={doSearch} disabled={searching}>
            {searching ? <span className="spin" /> : '搜索'}
          </button>
        </div>
        <div style={{ maxHeight: 360, overflow: 'auto' }}>
          {results.length === 0 && !searching && <div className="empty">无搜索结果，可尝试英文标题</div>}
          {results.map(r => (
            <div key={r.id} className={'result-item' + (selected?.id === r.id ? ' selected' : '')}
              onClick={() => setSelected(r)}>
              {POSTER(r.poster)
                ? <img className="result-poster" src={POSTER(r.poster)} alt="" loading="lazy" />
                : <div className="result-poster" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 18 }}>🎬</div>}
              <div className="result-info">
                <div className="result-title">{r.title}</div>
                <div className="result-meta">
                  {r.year || '—'} · {r.lang === 'zh-CN' ? '中文' : '英文'}
                  {r.original_title && r.original_title !== r.title ? ` · ${r.original_title}` : ''}
                </div>
                {r.overview && <div className="result-overview">{r.overview}</div>}
              </div>
              {selected?.id === r.id && <span className="tag ok">已选</span>}
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={confirm} disabled={busy || !selected}>
            {busy ? '匹配中…' : '确认匹配'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── 重命名预览弹窗 ── */
function RenameModal({ plan, mode, onClose }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function execute() {
    setBusy(true);
    try {
      const r = await api.renameExecute(plan.map(p => ({ id: p.id, newPath: p.newPath })));
      setDone(r);
      const dirMsg = r.removedDirs > 0 ? `，清理空目录 ${r.removedDirs} 个` : '';
      if (r.failed > 0) toast.error(`重命名完成：成功 ${r.renamed}，失败 ${r.failed}${dirMsg}`);
      else toast.success(`重命名成功 ${r.renamed} 个文件${dirMsg}`);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">重命名预览（{mode === 'full' ? 'Emby 完整结构' : '仅重命名文件'}）</div>
        <div className="modal-sub">共 {plan.length} 个文件，请确认变更内容</div>
        <div style={{ maxHeight: 380, overflow: 'auto' }}>
          {plan.map(p => (
            <div className="diff-block" key={p.id}>
              <div className="diff-old"><span className="diff-arrow">旧</span>{p.oldPath}</div>
              <div className="diff-new"><span className="diff-arrow">新</span>{p.newPath}</div>
            </div>
          ))}
        </div>
        {done && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, background: done.failed ? 'var(--heat-bg)' : 'rgba(48,209,88,0.1)' }}>
            <b style={{ color: done.failed ? '#c34e00' : '#248a3d' }}>
              成功 {done.renamed} / 失败 {done.failed}
              {done.removedDirs > 0 && <span style={{ marginLeft: 10 }}>· 清理空目录 {done.removedDirs} 个</span>}
            </b>
            {done.errors?.slice(0, 3).map((e, i) => <div key={i} className="muted" style={{ marginTop: 4 }}>✕ {e.message}</div>)}
          </div>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>{done ? '关闭' : '取消'}</button>
          {!done && <button className="btn primary" onClick={execute} disabled={busy}>{busy ? '执行中…' : '执行重命名'}</button>}
        </div>
      </div>
    </div>
  );
}

/* ── 主页面 ── */
export default function Library() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({ type: '', status: 'all', q: '' });
  const [selected, setSelected] = useState(new Set());
  const [matchItem, setMatchItem] = useState(null);
  const [renamePlan, setRenamePlan] = useState(null);
  const [renameMode, setRenameMode] = useState('file');
  const [busy, setBusy] = useState(false);
  const [autoBusy, setAutoBusy] = useState(false);
  const timer = useRef(null);

  async function load(f = filters) {
    try {
      const r = await api.items({ type: f.type, status: f.status, q: f.q, limit: 500 });
      setItems(r.items);
      setTotal(r.total);
    } catch (e) { toast.error(e.message); }
  }

  useEffect(() => { load(filters); }, [filters.type, filters.status]);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => load(filters), 300);
    return () => clearTimeout(timer.current);
  }, [filters.q]);

  function toggle(id) {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  }
  function toggleAll() {
    setSelected(selected.size === items.length ? new Set() : new Set(items.map(i => i.id)));
  }

  async function autoMatchAll() {
    const ids = selected.size ? [...selected] : items.filter(i => !i.tmdb_id).map(i => i.id);
    if (!ids.length) return toast.error('没有可匹配的条目');
    setAutoBusy(true);
    try {
      const r = await api.batchAutoMatch(ids);
      toast.success(`匹配完成：成功 ${r.matched}，失败 ${r.failed}`);
      load();
      setSelected(new Set());
    } catch (e) { toast.error(e.message); }
    finally { setAutoBusy(false); }
  }

  async function autoMatchOne(item) {
    try {
      await api.autoMatch(item.id);
      toast.success(`「${item.name}」匹配成功`);
      load();
    } catch (e) { toast.error(e.message); }
  }

  async function previewRename() {
    const ids = selected.size ? [...selected] : items.filter(i => i.tmdb_id).map(i => i.id);
    if (!ids.length) return toast.error('请先选择条目');
    setBusy(true);
    try {
      const r = await api.renamePreview(ids);
      setRenameMode(r.mode);
      setRenamePlan(r.plan);
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  const matchedCount = items.filter(i => i.tmdb_id).length;
  const typeFilter = (v) => setFilters({ ...filters, type: v });
  const statusFilter = (v) => setFilters({ ...filters, status: v });

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1 className="page-title">媒体库</h1>
          <p className="page-sub">共 {total} 个文件 · 已匹配 {matchedCount} · 已选 {selected.size}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={autoMatchAll} disabled={autoBusy}>
            {autoBusy ? <><span className="spin" /> 匹配中…</> : '⚡ 自动匹配 TMDB'}
          </button>
          <button className="btn primary" onClick={previewRename} disabled={busy}>
            {busy ? <span className="spin" /> : '✏️ 重命名预览'}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented">
          <button className={!filters.type ? 'active' : ''} onClick={() => typeFilter('')}>全部</button>
          <button className={filters.type === 'movie' ? 'active' : ''} onClick={() => typeFilter('movie')}>电影</button>
          <button className={filters.type === 'tv' ? 'active' : ''} onClick={() => typeFilter('tv')}>剧集</button>
        </div>
        <div className="segmented">
          <button className={filters.status === 'all' ? 'active' : ''} onClick={() => statusFilter('all')}>全部</button>
          <button className={filters.status === 'pending' ? 'active' : ''} onClick={() => statusFilter('pending')}>待匹配</button>
          <button className={filters.status === 'matched' ? 'active' : ''} onClick={() => statusFilter('matched')}>已匹配</button>
          <button className={filters.status === 'renamed' ? 'active' : ''} onClick={() => statusFilter('renamed')}>已重命名</button>
          <button className={filters.status === 'error' ? 'active' : ''} onClick={() => statusFilter('error')}>失败</button>
        </div>
        <div style={{ flex: 1, minWidth: 200, maxWidth: 300 }}>
          <input className="input" placeholder="搜索标题…" value={filters.q}
            onChange={e => setFilters({ ...filters, q: e.target.value })} />
        </div>
      </div>

      <div className="panel">
        <div className="row-list">
          {items.length === 0 && (
            <div className="empty">
              <div className="empty-icon">🎬</div>
              {total === 0 ? '媒体库为空，请先在设置中添加媒体目录并扫描' : '没有符合条件的条目'}
            </div>
          )}
          {items.map(item => (
            <div className="row" key={item.id}>
              <input type="checkbox" className="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} />
              <span className={'tag ' + item.type}>{item.type === 'movie' ? '电影' : '剧集'}</span>
              <div className="row-main">
                <div className="row-title">
                  {item.tmdb_title || item.name}
                  {item.year || item.tmdb_year ? <span className="muted"> ({item.tmdb_year || item.year})</span> : null}
                  {item.type === 'tv' && (item.epDate || item.ep_start != null) && (
                    <span className="muted">
                      {' '}· {item.epDate || `S${String(item.season ?? 0).padStart(2, '0')}E${String(item.ep_start).padStart(2, '0')}${item.ep_end ? '-' + String(item.ep_end).padStart(2, '0') : ''}`}
                      {item.ep_name ? ` ${item.ep_name}` : ''}
                    </span>
                  )}
                </div>
                <div className="row-sub">{item.path}</div>
              </div>
              {item.status === 'renamed'
                ? <span className="tag ok">已重命名</span>
                : item.tmdb_id
                  ? <span className="tag ok">已匹配</span>
                  : <span className="tag warn">待匹配</span>}
              {!item.tmdb_id && (
                <button className="btn sm" onClick={() => autoMatchOne(item)}>自动匹配</button>
              )}
              <button className="btn ghost sm" onClick={() => setMatchItem(item)}>手动匹配</button>
            </div>
          ))}
        </div>
      </div>

      {matchItem && (
        <MatchModal item={matchItem} onClose={() => setMatchItem(null)} onMatched={() => load()} />
      )}
      {renamePlan && (
        <RenameModal plan={renamePlan} mode={renameMode} onClose={() => { setRenamePlan(null); load(); }} />
      )}
    </div>
  );
}
