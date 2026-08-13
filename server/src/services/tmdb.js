const config = require('../config');

const BASE = 'https://api.themoviedb.org/3';

function apiKey() {
  return (config.get('tmdb_api_key') || '').trim();
}

async function tmdbFetch(path, params = {}) {
  const key = apiKey();
  if (!key) throw new Error('未配置 TMDB API Key');
  const qs = new URLSearchParams({ api_key: key, language: 'zh-CN', ...params });
  const res = await fetch(`${BASE}${path}?${qs}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TMDB 请求失败 (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

/** 搜索电影（中英文双查合并） */
async function searchMovie(query, year) {
  const results = [];
  const langs = ['zh-CN', 'en-US'];
  for (const lang of langs) {
    try {
      const data = await tmdbFetch('/search/movie', { query, year: year || undefined, include_adult: false, language: lang, page: 1 });
      results.push(...(data.results || []).map(r => ({
        id: r.id,
        title: r.title,
        original_title: r.original_title,
        year: r.release_date ? parseInt(r.release_date.slice(0, 4), 10) : null,
        overview: r.overview,
        poster: r.poster_path,
        kind: 'movie',
        lang,
      })));
    } catch (e) {
      if (e.message.includes('未配置')) throw e; // 配置类错误直接抛出
    }
  }
  return dedupe(results);
}

/** 搜索剧集 */
async function searchTv(query, year) {
  const results = [];
  const langs = ['zh-CN', 'en-US'];
  for (const lang of langs) {
    try {
      const data = await tmdbFetch('/search/tv', { query, year: year || undefined, include_adult: false, language: lang, page: 1 });
      results.push(...(data.results || []).map(r => ({
        id: r.id,
        title: r.name,
        original_title: r.original_name,
        year: r.first_air_date ? parseInt(r.first_air_date.slice(0, 4), 10) : null,
        overview: r.overview,
        poster: r.poster_path,
        kind: 'tv',
        lang,
      })));
    } catch (e) {
      if (e.message.includes('未配置')) throw e;
    }
  }
  return dedupe(results);
}

/** 自动匹配：优先同语言标题 + 年份一致 */
async function autoMatch(item) {
  if (item.type === 'tv') {
    const res = await searchTv(item.name, item.year || undefined);
    if (!res.length) return null;
    // 优先精确匹配年份
    let hit = res.find(r => r.year && item.year && r.year === item.year);
    if (!hit && item.epDate) {
      hit = res.find(r => r.year === parseInt(item.epDate.slice(0, 4), 10));
    }
    return hit || res[0];
  }
  const res = await searchMovie(item.name, item.year || undefined);
  if (!res.length) return null;
  let hit = res.find(r => r.year && item.year && r.year === item.year);
  return hit || res[0];
}

/** 获取详情（用于确认 + 后续扩展） */
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

function dedupe(arr) {
  const seen = new Set();
  return arr.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

module.exports = { searchMovie, searchTv, autoMatch, getDetails, apiKey };
