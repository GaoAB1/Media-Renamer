const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { signToken, authRequired } = require('../middleware/auth');

const router = express.Router();

// 是否已初始化（存在管理员）
function hasAdmin() {
  const row = getDb().prepare('SELECT COUNT(*) as c FROM users WHERE is_admin = 1').get();
  return row.c > 0;
}

// 系统初始化状态
router.get('/status', (req, res) => {
  res.json({ initialized: hasAdmin() });
});

// 首次启动引导：创建管理员
router.post('/setup', (req, res) => {
  if (hasAdmin()) return res.status(400).json({ error: '系统已初始化，管理员已存在' });
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' });
  if (username.length < 2 || username.length > 32) return res.status(400).json({ error: '用户名长度需为 2-32 个字符' });
  if (password.length < 6) return res.status(400).json({ error: '密码长度至少 6 位' });

  const hash = bcrypt.hashSync(password, 10);
  const info = getDb().prepare('INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)')
    .run(username.trim(), hash);
  const user = getDb().prepare('SELECT id, username, is_admin FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ ok: true, token: signToken(user), user });
});

// 登录
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = getDb().prepare('SELECT * FROM users WHERE username = ?').get((username || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  res.json({ ok: true, token: signToken(user), user: { id: user.id, username: user.username, is_admin: user.is_admin } });
});

// 当前用户
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
