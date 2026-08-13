const express = require('express');
const { authRequired } = require('../middleware/auth');
const { scanAll, getScanState } = require('../services/scanner');
const { getDb } = require('../db');

const router = express.Router();
router.use(authRequired);

// 触发全量扫描
router.post('/scan', (req, res) => {
  const result = scanAll();
  res.json(result);
});

// 扫描进度
router.get('/scan/status', (req, res) => {
  res.json(getScanState());
});

// 媒体库列表
router.get('/items', (req, res) => {
  const { type, status, q, limit = 200, offset = 0 } = req.query;
  const where = [];
  const params = {};
  if (type === 'movie' || type === 'tv') { where.push('type = @type'); params.type = type; }
  if (status && status !== 'all') { where.push('status = @status'); params.status = status; }
  if (q) { where.push('(name LIKE @q OR tmdb_title LIKE @q)'); params.q = `%${q}%`; }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const db = getDb();
  const rows = db.prepare(`SELECT * FROM media_items ${whereSql} ORDER BY id DESC LIMIT @limit OFFSET @offset`).all({ ...params, limit: +limit, offset: +offset });
  const total = db.prepare(`SELECT COUNT(*) as c FROM media_items ${whereSql}`).get(params).c;
  res.json({ items: rows, total });
});

// 统计（仪表盘）
router.get('/stats', (req, res) => {
  const db = getDb();
  const one = (sql) => db.prepare(sql).get().c;
  res.json({
    movies: one("SELECT COUNT(*) as c FROM media_items WHERE type='movie'"),
    tv: one("SELECT COUNT(*) as c FROM media_items WHERE type='tv'"),
    matched: one("SELECT COUNT(*) as c FROM media_items WHERE tmdb_id IS NOT NULL"),
    renamed: one("SELECT COUNT(*) as c FROM media_items WHERE status='renamed'"),
    pending: one("SELECT COUNT(*) as c FROM media_items WHERE status='pending' AND tmdb_id IS NULL"),
    errors: one("SELECT COUNT(*) as c FROM media_items WHERE status='error'"),
  });
});

// 重命名日志
router.get('/logs', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM rename_logs ORDER BY id DESC LIMIT 100').all();
  res.json({ logs: rows });
});

module.exports = router;
