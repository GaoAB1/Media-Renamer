const config = require('../config');
const log = require('./logger').create('tmdb');

const DEFAULT_BASE = 'https://api.themoviedb.org/3';
const DEFAULT_TIMEOUT = 15000;

// undici 随 Node 18+ 内置，无需 npm install
let undici = null;
try { undici = require('undici'); } catch (e) { /* 极旧版 Node 无此模块 */ }

function apiKey() {
  const envKey = (process.env.TMDB_API_KEY || '').trim();
  if (envKey) return envKey;
  return (config.get('tmdb_api_key') || '').trim();
}

function apiBase() {
  const custom = (config.get('tmdb_base_url') || '').trim().replace(/\/+$/, '');
  return custom || DEFAULT_BASE;
}

function timeoutMs() {
  const n = parseInt(config.get('tmdb_timeout') || '', 10);
  return Number.isFinite(n) && n >= 3000 && n <= 60000 ? n : DEFAULT_TIMEOUT;
}

/** 获取代理地址：设置页配置优先，环境变量兜底 */
function proxyUrl() {
  const fromConfig = (config.get('tmdb_proxy') || '').trim();
  if (fromConfig) return fromConfig;
  return (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || '').trim();
}

/** 缓存 ProxyAgent，避免每次请求重建 */
let _proxyAgent = null;
let _proxyUrlCached = '__none__';

function getProxyDispatcher() {
  const url = proxyUrl();
  if (!url) { _proxyAgent = null; _proxyUrlCached = '__none__'; return null; }
  if (url === _proxyUrlCached && _proxyAgent) return _proxyAgent;
  if (!undici || !undici.ProxyAgent) {
    log.warn('当前 Node 版本无 undici.ProxyAgent，代理设置将被忽略（请使用 Node 18+）');
    return null;
  }
  try {
    _proxyAgent = new undici.ProxyAgent(url);
    _proxyUrlCached = url;
    log.info(`TMDB 代理已启用: ${url}`);
    return _proxyAgent;
  } catch (e) {
    log.error(`代理地址无效: ${url}`, { error: e.message });
    return null;
  }
}

/** 构造干净的查询串（过滤 null/undefined/空串，避免 year=undefined 污染） */
function buildQs(params) {
  const clean = {};
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    clean[k] = v;
  }
  return new URLSearchParams(clean);
}

/** 网络错误翻译成可读中文提示 */
function friendlyNetError(e) {
  const msg = e && e.message ? e.message : String(e);
  const name = (e && e.name) || '';
  if (name === 'TimeoutError' || name === 'AbortError' || /timed? ?out|timeout/i.test(msg)) {
    return `连接 TMDB 超时（${apiBase()}），请检查网络或在设置中更换 API 地址/开启代理`;
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return `无法解析 TMDB 域名（${apiBase()}），请检查 DNS 或网络连通性`;
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `TMDB 连接被拒绝（${apiBase()}）`;
  }
  if (/ECONNRESET/i.test(msg)) {
    return `TMDB 连接被重置（${apiBase()}），可能被防火墙拦截或需要代理`;
  }
  if (/certificate|SSL|TLS/i.test(msg)) {
    return `TMDB SSL 证书校验失败（${apiBase()}）`;
  }
  return `网络错误: ${msg}`;
}

async function tmdbFetch(path, params = {}) {
  const key = apiKey();
  if (!key) {
    throw new Error('未配置 TMDB API Key，请先在设置中填写');
  }
  const qs = buildQs({ api_key: key, language: 'zh-CN', ...params });
  const url = `${apiBase()}${path}?${qs}`;
  const dispatcher = getProxyDispatcher();
  const t0 = Date.now();
  let res;
  try {
    const fetchOpts = {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs()),
    };
    if (dispatcher) fetchOpts.dispatcher = dispatcher;
    res = await fetch(url, fetchOpts);
  } catch (e) {
    const friendly = friendlyNetError(e);
    log.error(`请求失败 ${path}`, { url, proxy: dispatcher ? proxyUrl() : '直连', error: e.message, name: e.name });
    throw new Error(friendly);
  }
  const cost = Date.now() - t0;
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 401) hint = '（API Key 无效或已过期，请检查设置）';
    if (res.status === 404) hint = '（路径不存在，请检查 API 地址是否为 v3 根地址）';
    if (res.status === 429) hint = '（请求过于频繁，已被限流）';
    log.warn(`HTTP ${res.status} ${path} ${cost}ms${hint}`, { body: body.slice(0, 150) });
    throw new Error(`TMDB 请求失败 ${res.status}${hint}: ${body.slice(0, 200)}`);
  }
  const json = await res.json().catch(() => null);
  if (!json) {
    log.error(`响应解析失败 ${path}`, { cost });
    throw new Error('TMDB 响应解析失败（返回内容不是有效 JSON）');
  }
  log.debug(`GET ${path} → ${res.status} ${cost}ms`);
  return json;
}

function mapMovie(r, lang) {
  return {
    id: r.id,
    title: r.title,
    original_title: r.original_title,
    year: r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null,
    overview: r.overview,
    poster: r.poster_path,
    kind: 'movie',
    lang,
  };
}

function mapTv(r, lang) {
  return {
    id: r.id,
    title: r.name,
    original_title: r.original_name,
    year: r.first_air_date ? parseInt(r.first_air_date.slice(0, 4), 10) : null,
    overview: r.overview,
    poster: r.poster_path,
    kind: 'tv',
    lang,
  };
}

/** 搜索电影（中英文双查合并）；两次语言查询全部失败时抛出真实错误 */
async function searchMovie(query, year) {
  const results = [];
  const langs = ['zh-CN', 'en-US'];
  let lastErr = null;
  let okCount = 0;
  for (const lang of langs) {
    try {
      const data = await tmdbFetch('/search/movie', { query, year: year || undefined, include_adult: false, language: lang, page: 1 });
      okCount++;
      results.push(...(data.results || []).map(r => mapMovie(r, lang)));
    } catch (e) {
      if (e.message.includes('未配置') || e.message.includes('API Key 无效')) throw e;
      lastErr = e;
      log.warn(`searchMovie(${lang}) 失败`, { query, year, error: e.message });
    }
  }
  if (okCount === 0 && lastErr) throw lastErr;
  return dedupe(results);
}

/** 搜索剧集（中英文双查合并） */
async function searchTv(query, year) {
  const results = [];
  const langs = ['zh-CN', 'en-US'];
  let lastErr = null;
  let okCount = 0;
  for (const lang of langs) {
    try {
      const data = await tmdbFetch('/search/tv', { query, year: year || undefined, include_adult: false, language: lang, page: 1 });
      okCount++;
      results.push(...(data.results || []).map(r => mapTv(r, lang)));
    } catch (e) {
      if (e.message.includes('未配置') || e.message.includes('API Key 无效')) throw e;
      lastErr = e;
      log.warn(`searchTv(${lang}) 失败`, { query, year, error: e.message });
    }
  }
  if (okCount === 0 && lastErr) throw lastErr;
  return dedupe(results);
}

/** 自动匹配：优先同语言标题 + 年份一致 */
async function autoMatch(item) {
  const query = item.name;
  if (!query) {
    log.warn('autoMatch 跳过：条目无标题', { id: item.id, path: item.path });
    return null;
  }
  log.info(`自动匹配开始`, { id: item.id, type: item.type, name: query, year: item.year || null });
  try {
    if (item.type === 'tv') {
      const res = await searchTv(query, item.year || undefined);
      if (!res.length) {
        log.warn(`自动匹配无结果`, { id: item.id, name: query, type: 'tv' });
        return null;
      }
      let hit = res.find(r => r.year && item.year && r.year === item.year);
      if (!hit && item.epDate) {
        hit = res.find(r => r.year === parseInt(item.epDate.slice(0, 4), 10));
      }
      const final = hit || res[0];
      log.info(`自动匹配命中`, { id: item.id, tmdbId: final.id, title: final.title, year: final.year });
      return final;
    }
    const res = await searchMovie(query, item.year || undefined);
    if (!res.length) {
      log.warn(`自动匹配无结果`, { id: item.id, name: query, type: 'movie' });
      return null;
    }
    let hit = res.find(r => r.year && item.year && r.year === item.year);
    const final = hit || res[0];
    log.info(`自动匹配命中`, { id: item.id, tmdbId: final.id, title: final.title, year: final.year });
    return final;
  } catch (e) {
    log.error(`自动匹配出错`, { id: item.id, name: query, error: e.message });
    throw e;
  }
}

/** 获取详情（用于确认匹配 + 取 imdb_id） */
async function getDetails(kind, id) {
  const data = await tmdbFetch(`/${kind}/${id}`, { append_to_response: 'external_ids' });
  return {
    id: data.id,
    title: data.title || data.name,
    original_title: data.original_title || data.original_name,
    year: (data.release_date || data.first_air_date || '').slice(0, 4) || null,
    overview: data.overview,
    poster: data.poster_path,
    imdb_id: data.external_ids?.imdb_id || null,
    kind,
  };
}

/** 连接测试：设置页「测试连接」按钮使用 */
async function testConnection() {
  const t0 = Date.now();
  const data = await tmdbFetch('/configuration');
  return {
    ok: true,
    base: apiBase(),
    proxy: proxyUrl() || '直连',
    cost: Date.now() - t0,
    images_config: !!(data && data.images),
  };
}

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

module.exports = { searchMovie, searchTv, autoMatch, getDetails, testConnection, apiKey, apiBase, proxyUrl };
