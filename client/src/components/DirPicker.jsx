import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { toast } from './Toast.jsx';

/**
 * 服务器文件系统目录选择器（Modal）
 * 支持 Windows 盘符 / Unix 根 / 任意嵌套目录浏览
 */
export default function DirPicker({ initial, onSelect, onClose }) {
  const [cur, setCur] = useState(null);       // { path, parent, roots, dirs }
  const [loading, setLoading] = useState(false);

  async function browse(p) {
    setLoading(true);
    try {
      const r = await api.browseDirs(p);
      setCur(r);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }

  useEffect(() => { browse(initial || ''); }, []);

  function join(parent, name) {
    return parent.replace(/[\\/]+$/, '') + '/' + name;
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">选择媒体目录</div>
        <div className="modal-sub">浏览服务器文件系统，选择存放影视文件的文件夹</div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="input" readOnly
            placeholder={cur?.roots?.length ? '选择盘符或进入子目录…' : '加载中…'}
            value={cur?.path || ''} />
          <button className="btn" style={{ flexShrink: 0 }} title="回到根目录/盘符列表"
            onClick={() => browse('')}>🏠 根目录</button>
          {cur?.parent && (
            <button className="btn" style={{ flexShrink: 0 }} onClick={() => browse(cur.parent)}>⬆ 上级</button>
          )}
        </div>

        {cur?.roots?.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8, marginBottom: 12 }}>
            {cur.roots.map(r => (
              <button key={r} className="btn" style={{ justifyContent: 'center' }} onClick={() => browse(r)}>
                {r}
              </button>
            ))}
          </div>
        )}

        <div style={{
          maxHeight: 300, overflow: 'auto',
          border: '1px solid var(--hairline)', borderRadius: 'var(--r-card)',
          background: 'var(--bg)',
        }}>
          {loading && <div className="empty"><span className="spin" /> 加载中…</div>}
          {!loading && !cur?.dirs?.length && (
            <div className="empty"><div className="empty-icon">📁</div>此目录下没有子文件夹</div>
          )}
          {cur?.dirs?.map(d => (
            <div key={d} className="row" style={{ cursor: 'pointer', padding: '9px 14px' }}
              onClick={() => browse(join(cur.path, d))}>
              <span style={{ marginRight: 10, opacity: 0.7 }}>📁</span>
              <span style={{ fontSize: 14 }}>{d}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--text-4)', fontSize: 12 }}>›</span>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" disabled={!cur?.path || loading} onClick={() => onSelect(cur.path)}>
            选择此目录
          </button>
        </div>
      </div>
    </div>
  );
}
