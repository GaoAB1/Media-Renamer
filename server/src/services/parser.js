/**
 * 文件名解析器 —— 自研正则，支持 Emby 官方命名约定
 * 参考: https://emby.media/support/articles/TV-Naming.html
 *      https://emby.media/support/articles/Movie-Naming.html
 */

const path = require('path');

const VIDEO_EXT = new Set([
  '.mkv', '.mp4', '.avi', '.ts', '.m2ts', '.wmv', '.flv', '.mov', '.rmvb',
  '.webm', '.iso', '.dvd', '.bluray', '.strm', '.m4v', '.mpeg', '.mpg', '.vob',
]);

const EXTRA_DIRS = new Set([
  'extras', 'specials', 'shorts', 'scenes', 'featurettes', 'behind the scenes',
  'behindthescenes', 'deleted scenes', 'deletedscenes', 'interviews', 'trailers',
]);

const EXTRA_SUFFIX = [
  '-behindthescenes', '-deleted', '-featurette', '-interview', '-other',
  '-scene', '-short', '-trailer',
];

const RES_RE = /(2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10|hdr|dv|bluray|blu-ray|remux|web-?dl|webrip|hdtv|dvdrip|bdrip)/i;

// 版本标签（多版本电影，如 " - 1080p" / " - directors cut"）
const VERSION_WORDS = [
  'theatrical', 'extended', 'directors cut', 'director\'s cut', 'unrated',
  'unrated cut', 'remastered', '1080p', '2160p', '720p', '4k', '3d', 'imax',
  'hdr', 'bluray', 'blu-ray', 'web', 'webdl', 'web-dl', 'webrip', 'hdtv',
  'dvd', 'dvdrip', 'bdrip', 'remux', 'ultimate', 'collector', 'criterion',
  'special edition', '4k hdr', 'dolby vision', 'x264', 'x265', 'hevc', 'avc',
];

function isVideoExt(ext) {
  return VIDEO_EXT.has((ext || '').toLowerCase());
}

function isExtraDir(dirName) {
  return EXTRA_DIRS.has((dirName || '').toLowerCase());
}

function normalizeTitle(str) {
  return str
    .replace(/[\._]+/g, ' ')          // 点/下划线 -> 空格
    .replace(/\[[^\]]*\]/g, ' ')       // 去除方括号组
    .replace(/\([^)]*\)/g, ' ')        // 去除括号组（年份/分辨率等已提前提取）
    .replace(/[-–—]{1,}/g, ' ')        // 破折号 -> 空格
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function extractYear(str) {
  const m = str.match(/\b(19|20)\d{2}\b/);
  return m ? parseInt(m[0], 10) : null;
}

function extractResolution(str) {
  const m = str.match(RES_RE);
  return m ? m[1].toLowerCase() : null;
}

function extractVersion(str, title) {
  // 匹配 " - version" 或 "-version" 形式（标题后的版本）
  const lower = str.toLowerCase();
  const tLower = title.toLowerCase();
  let rest = lower.replace(tLower, '');
  for (const w of VERSION_WORDS) {
    const idx = rest.indexOf(w);
    if (idx !== -1) {
      return w.trim();
    }
  }
  return null;
}

/**
 * 解析剧集模式
 * 返回 { name, season, epStart, epEnd, epName, type:'tv' } 或 null
 */
function parseEpisode(str) {
  const original = str;

  // 1) SxxExx 系列：S01E01 / s01e01 / S01E02E03 / S01E02-E03 / S01xE02xE03
  //    lookbehind 允许 _ . 空格分隔（anything_s01e02 / anything.s01e02）
  let m = str.match(/(?<![0-9A-Za-z])S(\d{1,2})[x._\- ]?E(\d{1,3})(?:[x._\-]?E(\d{1,3}))?(?:[-x](\d{1,3}))?(?![0-9])/i);
  let sep = null;
  if (!m) {
    // 2) 1x02 / 01x02x03
    m = str.match(/(?<![0-9])(\d{1,2})[xX](\d{1,3})(?:[xX](\d{1,3}))?(?![0-9])/);
    if (m) sep = 'x';
  }
  if (!m) {
    // 2.5) 3 位简写 102 => S01E02（Emby: anything_102.ext）
    // 注意：先剔除分辨率标记（720p/480p/2160p），否则 720p 会被误匹配成 S7E20
    const noRes = str.replace(/\b\d{3,4}p\b/i, ' ');
    m = noRes.match(/(?<![0-9A-Za-z])(\d{1})(\d{2})(?![0-9])/);
    if (m) sep = 'short';
  }

  if (!m) {
    // 3) 日期命名 anything_1996.11.14 / 1996-11-14
    const dm = str.match(/\b((19|20)\d{2})[-.](\d{1,2})[-.](\d{1,2})\b/);
    if (dm) {
      const name = normalizeTitle(str.replace(dm[0], ' '));
      return {
        type: 'tv',
        name,
        season: null,
        epStart: null,
        epEnd: null,
        epName: null,
        epDate: dm[1] + '-' + String(dm[3]).padStart(2, '0') + '-' + String(dm[4]).padStart(2, '0'),
      };
    }
    // 4) 整季/合集: anything.S01 / anything.Season.1 / anything.Complete
    const sm = str.match(/(?<![0-9A-Za-z])S(\d{1,2})(?![0-9])|(?<![0-9A-Za-z])Season[\._\- ]?(\d{1,2})(?![0-9])/i);
    if (sm) {
      const season = parseInt(sm[1] || sm[2], 10);
      const marker = sm[0];
      const left = original.slice(0, original.indexOf(marker));
      return {
        type: 'tv',
        name: normalizeTitle(left) || 'Unknown',
        season,
        epStart: null,
        epEnd: null,
        epName: null,
        epDate: null,
      };
    }
    return null;
  }

  const season = parseInt(m[1], 10);
  const epStart = parseInt(m[2], 10);
  const epEnd = m[3] ? parseInt(m[3], 10) : null;

  // 从原始串中移除剧集标记，剩余部分拆分出 show name 和 episode name
  const marker = m[0];
  let left = original.slice(0, original.indexOf(marker));
  let right = original.slice(original.indexOf(marker) + marker.length);

  // episode name 可能在右侧（如 "Glee S01E01 Pilot"）
  let epName = null;
  right = right
    .replace(/^[-_ .]+/, '')
    .replace(/[-_ .]+$/, '');
  if (right && !/^\d+$/.test(right) && right.toLowerCase() !== 'extras') {
    epName = right.replace(/[\._]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  const name = normalizeTitle(left);
  return {
    type: 'tv',
    name: name || 'Unknown',
    season,
    epStart,
    epEnd,
    epName,
    epDate: null,
  };
}

/**
 * 解析电影（含多版本）
 */
function parseMovie(str) {
  const year = extractYear(str);

  // 提取版本标签：如 "Avatar (2009) - 1080p"
  // 先找到标题主体（移除年份与版本段）
  let title = str;
  if (year) {
    title = title.replace(new RegExp('\\s*\\(?\\b' + year + '\\b\\)?\\s*'), ' ');
  }
  // 版本标签通常是 " - xxx" 后缀
  let version = null;
  const vMatch = title.match(/\s*[-–—]\s*(.+?)\s*$/);
  if (vMatch) {
    const cand = vMatch[1].trim();
    const low = cand.toLowerCase();
    if (VERSION_WORDS.some(w => low.includes(w)) || RES_RE.test(cand)) {
      version = cand;
      title = title.slice(0, vMatch.index).trim();
    }
  }

  return {
    type: 'movie',
    name: normalizeTitle(title) || 'Unknown',
    year,
    version,
  };
}

/**
 * 判断文件是否位于「剧集特征目录」中：向上看 3 层，
 * 命中 Season x / Sxx / Specials 等目录名即为剧集。
 * 覆盖「用户把整个库目录配成 movie 但内部按 Emby 剧集结构组织」的场景。
 */
function isTvDirChain(dir) {
  if (!dir) return false;
  let cur = dir;
  for (let i = 0; i < 4; i++) {
    const name = path.basename(cur);
    if (/^season\s*\d{1,2}$/i.test(name)) return true;
    if (/^s\d{1,2}$/i.test(name)) return true;
    if (/^specials?$/i.test(name)) return true;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return false;
}

/** 从目录链提取季号（Season x / Sxx），找不到返回 null */
function extractSeasonFromChain(dir) {
  if (!dir) return null;
  let cur = dir;
  for (let i = 0; i < 4; i++) {
    const name = path.basename(cur);
    let m = name.match(/^season\s*(\d{1,2})$/i) || name.match(/^s(\d{1,2})$/i);
    if (m) return parseInt(m[1], 10);
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 主入口：解析完整文件路径/文件名
 * options: { hint: 'movie'|'tv'（媒体目录配置类型）, dirChain: 文件所在目录（向上探测 Season 结构） }
 * 返回 { type, name, year, season, epStart, epEnd, epName, epDate, resolution, version }
 */
function parseFile(fileName, options = {}) {
  const { hint, dirChain } = options || {};
  const extMatch = fileName.match(/\.([A-Za-z0-9]+)$/);
  const extension = extMatch ? extMatch[1].toLowerCase() : '';
  const base = fileName.replace(/\.[A-Za-z0-9]+$/, '');

  const resolution = extractResolution(base);

  // 剧集解析
  const ep = parseEpisode(base);
  if (ep) {
    return {
      type: 'tv',
      name: ep.name,
      year: extractYear(base),
      season: ep.season,
      epStart: ep.epStart,
      epEnd: ep.epEnd,
      epName: ep.epName,
      epDate: ep.epDate,
      resolution,
      version: null,
      extension,
    };
  }

  // 目录上下文是剧集（配置类型 tv 或目录链含 Season 结构）→ 无 S/E 标记也按剧集入库
  const inTvContext = hint === 'tv' || isTvDirChain(dirChain);
  if (inTvContext) {
    const mv = parseMovie(base);
    let name = mv.name;
    // 剔除标题残留的分辨率标记（如 "Friends.1080p" -> "Friends"）
    if (resolution) {
      name = name.replace(new RegExp('\\b' + escapeReg(resolution) + '\\b', 'i'), ' ').replace(/\s+/g, ' ').trim();
    }
    return {
      type: 'tv',
      name: name || 'Unknown',
      year: mv.year,
      season: extractSeasonFromChain(dirChain),
      epStart: null,
      epEnd: null,
      epName: null,
      epDate: null,
      resolution,
      version: mv.version,
      extension,
    };
  }

  // 电影解析
  const movie = parseMovie(base);
  return {
    type: 'movie',
    name: movie.name,
    year: movie.year,
    season: null,
    epStart: null,
    epEnd: null,
    epName: null,
    epDate: null,
    resolution,
    version: movie.version,
    extension,
  };
}

module.exports = {
  VIDEO_EXT, EXTRA_DIRS, EXTRA_SUFFIX,
  isVideoExt, isExtraDir, parseFile, extractYear, extractResolution,
  isTvDirChain, extractSeasonFromChain,
};
