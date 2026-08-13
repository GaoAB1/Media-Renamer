const Database = require('better-sqlite3');
const config = require('./config');

let db = null;

function init() {
  if (db) return db;
  config.ensureDir();
  db = new Database(config.DB_FILE);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,                 -- movie / tv
      path TEXT NOT NULL UNIQUE,          -- 当前文件路径
      orig_path TEXT,                     -- 首次扫描时的路径
      name TEXT,                          -- 解析出的标题
      year INTEGER,
      season INTEGER,                     -- 剧集：季
      ep_start INTEGER,                   -- 剧集：起始集号
      ep_end INTEGER,                     -- 剧集：结束集号（多集文件）
      ep_name TEXT,                       -- 剧集：集名
      ep_date TEXT,                       -- 剧集：日期命名
      resolution TEXT,
      version TEXT,                       -- 多版本标签（如 1080p / directors cut）
      extension TEXT,
      is_extra INTEGER DEFAULT 0,         -- extras/特典文件
      tmdb_id INTEGER,
      imdb_id TEXT,
      tmdb_title TEXT,
      tmdb_original_title TEXT,
      tmdb_year INTEGER,
      tmdb_poster TEXT,
      tmdb_overview TEXT,
      tmdb_kind TEXT,                     -- movie / tv（TMDB 侧）
      match_method TEXT,                  -- auto / manual
      matched_at TEXT,
      new_path TEXT,                      -- 重命名目标路径
      status TEXT DEFAULT 'pending',      -- pending / matched / renamed / error
      renamed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS rename_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER,
      old_path TEXT,
      new_path TEXT,
      status TEXT,
      message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_items_type ON media_items(type);
    CREATE INDEX IF NOT EXISTS idx_items_status ON media_items(status);
  `);

  return db;
}

function getDb() {
  return db || init();
}

module.exports = { init, getDb };
