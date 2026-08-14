const fs = require('fs');
const path = require('path');
const { isVideoExt, isExtraDir, parseFile } = require('./parser');
const { getDb } = require('../db');

const HIDDEN = new Set(['.git', '.DS_Store', '@eaDir', '$RECYCLE.BIN', 'System Volume Information', 'lost+found', '.thumbnails']);

let scanState = { running: false, progress: 0, total: 0, found: 0, message: '' };

/**
 * 递归扫描目录，返回视频文件列表
 */
function walk(dir, acc = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return acc;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (HIDDEN.has(ent.name)) continue;
      walk(full, acc);
    } else if (ent.isFile() && isVideoExt(path.extname(ent.name))) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 全量扫描：清空旧记录，重新扫描所有媒体目录
 */
function scanAll() {
  if (scanState.running) return { ok: false, message: '扫描已在运行中' };
  const config = require('../config');
  const dirs = (config.get('media_dirs') || []).filter(d => d && d.path);

  if (dirs.length === 0) {
    return { ok: false, message: '尚未配置媒体目录，请先在设置中添加' };
  }

  scanState = { running: true, progress: 0, total: 0, found: 0, message: '开始扫描...' };

  // 异步执行，避免阻塞请求
  setTimeout(() => {
    try {
      const db = getDb();
      const allFiles = [];
      for (const d of dirs) {
        if (!fs.existsSync(d.path)) {
          scanState.message = `目录不存在: ${d.path}`;
          continue;
        }
        scanState.message = `扫描目录: ${d.path}`;
        allFiles.push(...walk(d.path));
      }
      scanState.total = allFiles.length;

      db.prepare('DELETE FROM media_items').run();
      const insert = db.prepare(`INSERT OR IGNORE INTO media_items
        (type, path, orig_path, name, year, season, ep_start, ep_end, ep_name, ep_date, resolution, version, extension, is_extra, created_at)
        VALUES (@type, @path, @path, @name, @year, @season, @epStart, @epEnd, @epName, @epDate, @resolution, @version, @extension, @isExtra, datetime('now'))`);

      const insertAll = db.transaction((items) => {
        for (const it of items) insert.run(it);
      });

      const items = [];
      for (const f of allFiles) {
        const rel = path.relative(path.dirname(f), f);
        const parentDir = path.basename(path.dirname(f));
        const dirConfig = dirs
          .filter(d => f.startsWith(d.path))
          .sort((a, b) => b.path.length - a.path.length)[0];
        const p = parseFile(path.basename(f), {
          hint: dirConfig && dirConfig.type === 'tv' ? 'tv' : (dirConfig ? dirConfig.type : undefined),
          dirChain: path.dirname(f),
        });
        const isExtra = isExtraDir(parentDir);
        items.push({
          type: p.type,
          path: f,
          name: p.name,
          year: p.year,
          season: p.season,
          epStart: p.epStart,
          epEnd: p.epEnd,
          epName: p.epName,
          epDate: p.epDate,
          resolution: p.resolution,
          version: p.version,
          extension: p.extension,
          isExtra: isExtra ? 1 : 0,
        });
        scanState.found = items.length;
        scanState.progress = items.length;
      }
      insertAll(items);
      scanState.message = `扫描完成，共发现 ${items.length} 个视频文件`;
    } catch (e) {
      scanState.message = '扫描出错: ' + e.message;
    } finally {
      scanState.running = false;
    }
  }, 0);

  return { ok: true, message: '扫描已启动' };
}

function getScanState() {
  return { ...scanState };
}

module.exports = { scanAll, getScanState, walk };
