const express = require('express');
const { authRequired } = require('../middleware/auth');
const logger = require('../services/logger');
const { getDb } = require('../db');

const router = express.Router();
router.use(authRequired);

// 运行日志（内存环 + 文件）
router.get('/', (req, res) => {
  const { level, limit, since, q } = req.query;
  res.json({ logs: logger.query({ level, limit, since, q }) });
});

// 清空运行日志（内存 + 磁盘）
router.delete('/', (req, res) => {
  res.json(logger.clear());
});

// 重命名日志（来自 rename_logs 表）
router.get('/rename', (req, res) => {
  const db = getDb();
  const { limit = 100, status } = req.query;
  const params = {};
  let where = '';
  if (status) { where = 'WHERE status = @status'; params.status = status; }
  const rows = db.prepare(`SELECT * FROM rename_logs ${where} ORDER BY id DESC LIMIT @limit`).all({ ...params, limit: +limit || 100 });
  res.json({ logs: rows });
});

module.exports = router;
