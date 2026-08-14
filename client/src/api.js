const TOKEN_KEY = 'mr_token';

export function getToken() { return localStorage.getItem(TOKEN_KEY); }
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });
  if (res.status === 401 && !path.includes('/auth/')) {
    setToken(null);
    window.location.href = '/login';
    throw new Error('登录已过期');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export const api = {
  // auth
  authStatus: () => request('/api/auth/status'),
  setup: (username, password) => request('/api/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) }),
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  me: () => request('/api/auth/me'),

  // settings
  getSettings: () => request('/api/settings'),
  saveSettings: (s) => request('/api/settings', { method: 'PUT', body: JSON.stringify(s) }),
  browseDirs: (p) => request(`/api/settings/browse?path=${encodeURIComponent(p || '')}`),
  tmdbTest: () => request('/api/settings/tmdb-test', { method: 'POST' }),

  // logs
  getLogs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return request(`/api/logs?${qs}`);
  },
  clearLogs: () => request('/api/logs', { method: 'DELETE' }),
  getRenameLogs: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return request(`/api/logs/rename?${qs}`);
  },

  // library
  scan: () => request('/api/library/scan', { method: 'POST' }),
  scanStatus: () => request('/api/library/scan/status'),
  items: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null)).toString();
    return request(`/api/library/items?${qs}`);
  },
  stats: () => request('/api/library/stats'),
  logs: () => request('/api/library/logs'),

  // tmdb & rename
  search: (q, kind, year) => request(`/api/search?q=${encodeURIComponent(q)}&kind=${kind}${year ? `&year=${year}` : ''}`),
  autoMatch: (id) => request(`/api/items/${id}/auto-match`, { method: 'POST' }),
  batchAutoMatch: (ids) => request('/api/auto-match', { method: 'POST', body: JSON.stringify({ ids }) }),
  match: (id, tmdbId, kind) => request(`/api/items/${id}/match`, { method: 'POST', body: JSON.stringify({ tmdbId, kind }) }),
  renamePreview: (ids) => request('/api/rename/preview', { method: 'POST', body: JSON.stringify({ ids }) }),
  renameExecute: (plan) => request('/api/rename/execute', { method: 'POST', body: JSON.stringify({ plan }) }),
};
