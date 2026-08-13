const path = require('path');
const fs = require('fs');

// 配置目录：Docker 中挂载 /config，开发默认 ./data
const CONFIG_DIR = process.env.CONFIG_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DB_FILE = path.join(CONFIG_DIR, 'media.db');

const DEFAULTS = {
  tmdb_api_key: '',
  media_dirs: [],          // [{ path: '/media/movies', type: 'movie' }, ...]
  rename_mode: 'file',     // file=仅重命名文件 / full=Emby完整目录结构
  movie_folder: 'Movies',
  tv_folder: 'TV',
};

let cache = null;

function ensureDir() {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (e) {
      cache = { ...DEFAULTS };
    }
  } else {
    cache = { ...DEFAULTS };
    save();
  }
  return cache;
}

function save() {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cache, null, 2), 'utf8');
}

function get(key) {
  if (!cache) load();
  return key ? cache[key] : cache;
}

function set(key, value) {
  if (!cache) load();
  cache[key] = value;
  save();
}

module.exports = { CONFIG_DIR, DB_FILE, get, set, load, ensureDir };
