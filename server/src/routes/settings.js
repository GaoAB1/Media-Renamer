const express = require('express');
const fs = require('fs');
const path = require('path');
const { authRequired } = require('../middleware/auth');
const config = require('../config');

const router = express.Router();
router.use(authRequired);

/**
 * 目录浏览（只读，供前端目录选择器）
 * GET /api/settings/browse?path=C:/xxx
 * - 无 path：返回系统根（Windows: 存在的盘符；Unix: /）
 * - 有 path：返回该目录下的子目录列表
 */
router.get('/browse', (req, res) => {
  const target = (req.query.path || '').trim();
  try {
    // 无 path → 返回根
    if (!target) {
      if (process.platform === 'win32') {
        const roots = [];
        for (let i = 65; i <= 90; i++) {
          const letter = String.fromCharCode(i) + ':/';
          try { fs.accessSync(letter); roots.push(letter); } catch (e) { /* 跳过不存在的盘符 */ }
        }
        return res.json({ path: '', parent: null, roots, dirs: [] });
      }
      return res.json({ path: '', parent: null, roots: ['/'], dirs: [] });
    }

    if (!fs.existsSync(target)) return res.status(404).json({ error: '路径不存在' });
    if (!fs.statSync(target).isDirectory()) return res.status(400).json({ error: '不是目录' });

    const dirs = fs.readdirSync(target, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .filter(n => !n.startsWith('.'))  // 隐藏目录
      .sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true, sensitivity: 'base' }));

    // 盘符根（C:/）或 Unix 根（/）没有上级
    const trimmed = target.replace(/[\\/]+$/, '');
    const parent = path.dirname(trimmed);
    res.json({ path: target, parent: parent === trimmed ? null : parent, roots: [], dirs });
  } catch (e) {
    res.status(500).json({ error: '无法读取目录：' + e.message });
  }
});

// 获取设置（隐藏敏感信息展示用）
router.get('/', (req, res) => {
  res.json({
    tmdb_api_key: config.get('tmdb_api_key') ? '••••••••' + config.get('tmdb_api_key').slice(-4) : '',
    has_tmdb_key: !!config.get('tmdb_api_key'),
    media_dirs: config.get('media_dirs') || [],
    rename_mode: config.get('rename_mode') || 'file',
  });
});

// 更新设置（完整值）
router.put('/', (req, res) => {
  const { tmdb_api_key, media_dirs, rename_mode } = req.body || {};
  if (typeof tmdb_api_key === 'string') config.set('tmdb_api_key', tmdb_api_key.trim());
  if (Array.isArray(media_dirs)) {
    const clean = media_dirs
      .filter(d => d && d.path && d.path.trim())
      .map(d => ({ path: d.path.trim().replace(/[\\/]+$/, ''), type: d.type === 'tv' ? 'tv' : 'movie' }));
    config.set('media_dirs', clean);
  }
  if (rename_mode === 'file' || rename_mode === 'full') config.set('rename_mode', rename_mode);
  res.json({ ok: true, settings: { tmdb_api_key: config.get('tmdb_api_key') ? '已配置' : '', media_dirs: config.get('media_dirs'), rename_mode: config.get('rename_mode') } });
});

module.exports = router;
