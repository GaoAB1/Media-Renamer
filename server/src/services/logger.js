/**
 * 轻量应用日志器
 * - 内存环形缓冲（用于 API 查询最近 N 条）
 * - 按天滚动写文件 logs/app-YYYY-MM-DD.log，保留最近 7 天
 * - 无三方依赖
 */
const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('../config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const RING_SIZE = 2000;

let ring = [];
let logDir = null;
let today = '';

function levelRank(l) { return LEVELS[l] ?? 20; }

function dayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureLogDir() {
  if (!logDir) {
    logDir = path.join(CONFIG_DIR, 'logs');
    try { fs.mkdirSync(logDir, { recursive: true }); } catch (e) { /* ignore */ }
  }
  return logDir;
}

function writeFile(level, scope, msg, extra) {
  const dk = dayKey();
  if (dk !== today) {
    today = dk;
    rotate();
  }
  const line = formatLine(level, scope, msg, extra);
  try {
    const file = path.join(ensureLogDir(), `app-${today}.log`);
    fs.appendFileSync(file, line + '\n', { flag: 'a', encoding: 'utf8' });
  } catch (e) {
    // 写文件失败不应影响业务，只回退到 console
    try { console.error('[logger-write-fail]', e.message); } catch (_) {}
  }
}

/** 简单按天 + 文件大小滚动，保留最近 7 天 + 单个文件上限 20MB */
function rotate() {
  const maxBytes = 20 * 1024 * 1024;
  let rotated = false;
  try {
    const file = path.join(ensureLogDir(), `app-${today}.log`);
    if (fs.existsSync(file)) {
      const st = fs.statSync(file);
      if (st.size >= maxBytes) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.renameSync(file, `${file}.${stamp}`);
        rotated = true;
      }
    }
  } catch (e) { /* ignore */ }

  // 清理过期日志（>7 天）
  try {
    const keep = 7;
    const cutoff = Date.now() - keep * 86400000;
    fs.readdirSync(logDir)
      .filter(f => /^app-\d{4}-\d{2}-\d{2}(\.log.*)?$/.test(f))
      .forEach(f => {
        try {
          const st = fs.statSync(path.join(logDir, f));
          if (st.mtimeMs < cutoff) fs.unlinkSync(path.join(logDir, f));
        } catch (_) {}
      });
  } catch (e) { /* ignore */ }
  return rotated;
}

function ts() {
  return new Date().toISOString();
}

function stringifyExtra(extra) {
  if (extra == null) return '';
  if (typeof extra === 'string') return ' ' + extra;
  try { return ' ' + JSON.stringify(extra); } catch (_) { return ''; }
}

function formatLine(level, scope, msg, extra) {
  return `${ts()} ${level.toUpperCase().padEnd(5)} [${scope || 'app'}] ${msg}${stringifyExtra(extra)}`;
}

function _log(level, scope, msg, extra) {
  const entry = { ts: ts(), level, scope: scope || 'app', msg: msg == null ? '' : String(msg), extra };
  ring.push(entry);
  if (ring.length > RING_SIZE) ring = ring.slice(ring.length - RING_SIZE);
  // 控制台镜像（便于 docker logs），error/warn 走 stderr
  const line = formatLine(level, scope, msg, extra);
  try {
    if (levelRank(level) >= LEVELS.error) console.error(line);
    else if (levelRank(level) >= LEVELS.warn) console.warn(line);
    else console.log(line);
  } catch (_) {}
  writeFile(level, scope, msg, extra);
}

function create(scope) {
  return {
    debug: (msg, extra) => _log('debug', scope, msg, extra),
    info: (msg, extra) => _log('info', scope, msg, extra),
    warn: (msg, extra) => _log('warn', scope, msg, extra),
    error: (msg, extra) => _log('error', scope, msg, extra),
  };
}

const defaultLogger = create('app');

function query(opts = {}) {
  const { level, limit = 500, since, q } = opts;
  let out = ring.slice().reverse();
  if (level && LEVELS[level]) {
    out = out.filter(e => levelRank(e.level) >= LEVELS[level]);
  }
  if (since) {
    const t = new Date(since).getTime();
    if (!isNaN(t)) out = out.filter(e => new Date(e.ts).getTime() >= t);
  }
  if (q) {
    const ql = q.toLowerCase();
    out = out.filter(e => (e.msg + (e.scope || '')).toLowerCase().includes(ql) || (e.extra && JSON.stringify(e.extra).toLowerCase().includes(ql)));
  }
  out = out.slice(0, +limit || 500);
  return out;
}

function clear() {
  ring = [];
  try {
    ensureLogDir();
    for (const f of fs.readdirSync(logDir)) {
      if (/^app-/.test(f)) {
        try { fs.unlinkSync(path.join(logDir, f)); } catch (_) {}
      }
    }
  } catch (_) {}
  return { ok: true };
}

module.exports = { ...defaultLogger, create, query, clear, LEVELS, levelRank };
