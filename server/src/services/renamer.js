const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const config = require('../config');

const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitize(name) {
  return (name || '')
    .replace(ILLEGAL, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')  // 结尾不允许点/空格
    .slice(0, 180);
}

function idTag(item) {
  return item.tmdb_id ? ` [tmdbid=${item.tmdb_id}]` : '';
}

/**
 * 生成 Emby 规范的目标文件名/路径
 * mode: file=仅重命名当前文件（原地） / full=完整目录结构
 */
function buildNewPath(item, mode) {
  const title = item.tmdb_title || item.name;
  const year = item.tmdb_year || item.year;
  const ext = '.' + (item.extension || 'mkv');
  const mediaDirs = (config.get('media_dirs') || []);
  const movieRoot = mediaDirs.find(d => d.type === 'movie')?.path || '';
  const tvRoot = mediaDirs.find(d => d.type === 'tv')?.path || '';

  if (item.type === 'movie') {
    const base = `${sanitize(title)} (${year || ''})`.trim();
    // 多版本：Title (year) - version.ext（Emby 多版本规范，同文件夹）
    const fileName = item.version
      ? `${base} - ${sanitize(item.version)}${idTag(item)}${ext}`
      : `${base}${idTag(item)}${ext}`;

    if (mode === 'full' && movieRoot) {
      const dir = path.join(movieRoot, base);
      return path.join(dir, fileName);
    }
    // file 模式：原地重命名
    return path.join(path.dirname(item.path), fileName);
  }

  // ---- 剧集 ----
  const showName = sanitize(title);
  const season = item.season ?? 0;
  const ss = String(season).padStart(2, '0');

  let epPart;
  if (item.ep_date) {
    // 日期命名：Title 1996-11-14.ext
    epPart = `${showName} ${item.ep_date}`;
  } else {
    const ep = String(item.ep_start ?? 1).padStart(2, '0');
    let seq = `S${ss}E${ep}`;
    if (item.ep_end) seq += `-E${String(item.ep_end).padStart(2, '0')}`;
    const epName = item.ep_name ? ` - ${sanitize(item.ep_name)}` : '';
    epPart = `${showName} ${seq}${epName}`;
  }
  const fileName = `${epPart}${ext}`;

  if (mode === 'full' && tvRoot) {
    const seriesDir = year ? `${showName} (${year})` : showName;
    // 日期命名的日常节目无季目录，直接放剧集根目录
    if (item.ep_date) return path.join(tvRoot, seriesDir, fileName);
    const seasonDir = season > 0 ? `Season ${season}` : 'Specials';
    return path.join(tvRoot, seriesDir, seasonDir, fileName);
  }
  return path.join(path.dirname(item.path), fileName);
}

/** 批量生成预览（不执行任何文件操作） */
function preview(items) {
  const mode = config.get('rename_mode') || 'file';
  return items.map(item => {
    const newPath = buildNewPath(item, mode);
    return { id: item.id, oldPath: item.path, newPath };
  });
}

/**
 * 清理空目录：从 startDir 向上逐级删除空目录
 * 停止条件：媒体根目录 / 文件系统根 / 目录非空 / 无权限
 * @returns {number} 删除的目录数量
 */
function cleanupEmptyDirs(startDir) {
  const roots = (config.get('media_dirs') || [])
    .map(d => d.path.replace(/[\\/]+$/, '').toLowerCase());

  let removed = 0;
  let dir = startDir;
  let guard = 0;

  while (dir && guard++ < 64) {
    const parent = path.dirname(dir);
    if (parent === dir) break;                          // 文件系统根
    const normalized = dir.replace(/[\\/]+$/, '');
    if (roots.includes(normalized.toLowerCase())) break; // 媒体根，不删
    try {
      if (fs.readdirSync(dir).length > 0) break;         // 非空，停止
      try { fs.rmdirSync(dir); } catch (e) { /* 部分环境删除后仍抛错，忽略 */ }
      if (fs.existsSync(dir)) break;                     // 删除失败，停止
      removed++;
    } catch (e) {
      break;                                             // 无权限/不存在/其他异常
    }
    dir = parent;
  }
  return removed;
}

/**
 * 执行重命名（批量，事务记录日志）
 * 重命名成功后自动向上清理空的源目录
 */
function execute(plan) {
  const db = getDb();
  const log = db.prepare(`INSERT INTO rename_logs (item_id, old_path, new_path, status, message, created_at)
                          VALUES (?, ?, ?, ?, ?, datetime('now'))`);
  const results = [];
  const errors = [];
  let removedDirs = 0;

  for (const p of plan) {
    const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(p.id);
    if (!item) { errors.push({ id: p.id, message: '记录不存在' }); continue; }

    try {
      const oldPath = item.path;
      const newPath = p.newPath;
      if (!fs.existsSync(oldPath)) throw new Error('源文件不存在');
      if (oldPath === newPath) throw new Error('文件名未变化');

      // Windows 下大小写变更需要两步
      if (process.platform === 'win32' && oldPath.toLowerCase() === newPath.toLowerCase()) {
        const tmp = oldPath + '.rename-tmp-' + Date.now();
        fs.renameSync(oldPath, tmp);
        fs.renameSync(tmp, newPath);
      } else {
        fs.mkdirSync(path.dirname(newPath), { recursive: true });
        fs.renameSync(oldPath, newPath);
      }

      db.prepare(`UPDATE media_items SET path = ?, status = 'renamed', new_path = ?, renamed_at = datetime('now') WHERE id = ?`)
        .run(newPath, newPath, item.id);
      log.run(item.id, oldPath, newPath, 'success', '');
      results.push({ id: item.id, oldPath, newPath });

      // 文件被移动走后，清理空的源目录（如每集一个文件夹的散乱结构）
      removedDirs += cleanupEmptyDirs(path.dirname(oldPath));
    } catch (e) {
      log.run(item.id, item.path, p.newPath, 'error', e.message);
      db.prepare(`UPDATE media_items SET status = 'error' WHERE id = ?`).run(item.id);
      errors.push({ id: p.id, oldPath: item.path, message: e.message });
    }
  }

  return { ok: true, renamed: results.length, failed: errors.length, results, errors, removedDirs };
}

module.exports = { buildNewPath, preview, execute, sanitize, cleanupEmptyDirs };
