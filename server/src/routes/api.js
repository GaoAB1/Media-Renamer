const express = require('express');
const { authRequired } = require('../middleware/auth');
const { getDb } = require('../db');
const tmdb = require('../services/tmdb');
const renamer = require('../services/renamer');

const router = express.Router();
router.use(authRequired);

// TMDB 搜索（供手动匹配弹窗使用）
router.get('/search', async (req, res) => {
  const { q, kind, year } = req.query;
  if (!q) return res.status(400).json({ error: '缺少搜索关键词' });
  try {
    const results = kind === 'tv' ? await tmdb.searchTv(q, year) : await tmdb.searchMovie(q, year);
    res.json({ results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 单条自动匹配
router.post('/items/:id/auto-match', async (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '记录不存在' });

  try {
    const hit = await tmdb.autoMatch(item);
    if (!hit) return res.status(404).json({ error: 'TMDB 未找到匹配项，请手动匹配' });
    const detail = await tmdb.getDetails(hit.kind, hit.id);
    db.prepare(`UPDATE media_items SET tmdb_id=@id, imdb_id=@imdb, tmdb_title=@title, tmdb_original_title=@otitle,
                tmdb_year=@year, tmdb_poster=@poster, tmdb_overview=@overview, tmdb_kind=@kind,
                match_method='auto', matched_at=datetime('now'), status='matched' WHERE id=@rowid`)
      .run({ id: detail.id, imdb: detail.imdb_id, title: detail.title, otitle: detail.original_title, year: detail.year, poster: detail.poster, overview: detail.overview, kind: detail.kind, rowid: item.id });
    res.json({ ok: true, item: db.prepare('SELECT * FROM media_items WHERE id = ?').get(item.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 手动指定匹配（tmdbId + kind）
router.post('/items/:id/match', async (req, res) => {
  const { tmdbId, kind } = req.body || {};
  if (!tmdbId || !kind) return res.status(400).json({ error: '缺少 tmdbId 或 kind' });
  const db = getDb();
  const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: '记录不存在' });

  try {
    const detail = await tmdb.getDetails(kind, tmdbId);
    db.prepare(`UPDATE media_items SET tmdb_id=@id, imdb_id=@imdb, tmdb_title=@title, tmdb_original_title=@otitle,
                tmdb_year=@year, tmdb_poster=@poster, tmdb_overview=@overview, tmdb_kind=@kind,
                match_method='manual', matched_at=datetime('now'), status='matched' WHERE id=@rowid`)
      .run({ id: detail.id, imdb: detail.imdb_id, title: detail.title, otitle: detail.original_title, year: detail.year, poster: detail.poster, overview: detail.overview, kind: detail.kind, rowid: item.id });
    res.json({ ok: true, item: db.prepare('SELECT * FROM media_items WHERE id = ?').get(item.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 批量自动匹配（限 50 条/次）
router.post('/auto-match', async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '未选择条目' });
  const db = getDb();
  const chunk = ids.slice(0, 50);
  const results = { matched: 0, failed: 0, errors: [] };
  for (const id of chunk) {
    const item = db.prepare('SELECT * FROM media_items WHERE id = ?').get(id);
    if (!item || item.tmdb_id) continue;
    try {
      const hit = await tmdb.autoMatch(item);
      if (!hit) { results.failed++; results.errors.push({ id, message: '未找到' }); continue; }
      const detail = await tmdb.getDetails(hit.kind, hit.id);
      db.prepare(`UPDATE media_items SET tmdb_id=@id, tmdb_title=@title, tmdb_original_title=@otitle,
                  tmdb_year=@year, tmdb_poster=@poster, tmdb_overview=@overview, tmdb_kind=@kind,
                  match_method='auto', matched_at=datetime('now'), status='matched' WHERE id=@rowid`)
        .run({ id: detail.id, title: detail.title, otitle: detail.original_title, year: detail.year, poster: detail.poster, overview: detail.overview, kind: detail.kind, rowid: id });
      results.matched++;
    } catch (e) {
      results.failed++;
      results.errors.push({ id, message: e.message });
    }
  }
  res.json({ ok: true, ...results });
});

// 重命名预览（必须已匹配）
router.post('/rename/preview', (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '未选择条目' });
  const db = getDb();
  const items = ids.map(id => db.prepare('SELECT * FROM media_items WHERE id = ?').get(id)).filter(Boolean);
  const noMatch = items.filter(i => !i.tmdb_id);
  if (noMatch.length) return res.status(400).json({ error: `有 ${noMatch.length} 个条目尚未匹配 TMDB` });
  const plan = renamer.preview(items);
  res.json({ ok: true, plan, mode: require('../config').get('rename_mode') });
});

// 执行重命名
router.post('/rename/execute', (req, res) => {
  const { plan } = req.body || {};
  if (!Array.isArray(plan) || !plan.length) return res.status(400).json({ error: '重命名计划为空' });
  const result = renamer.execute(plan);
  res.json(result);
});

module.exports = router;
