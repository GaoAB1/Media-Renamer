const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { init } = require('./db');
const config = require('./config');
const log = require('./services/logger').create('server');
const authRoutes = require('./routes/auth');
const settingsRoutes = require('./routes/settings');
const libraryRoutes = require('./routes/library');
const logsRoutes = require('./routes/logs');
const apiRoutes = require('./routes/api');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// 请求日志（排除健康检查与静态资源）
app.use((req, res, next) => {
  if (req.path === '/api/health' || /^\/(?!api).+/.test(req.path)) return next();
  const t0 = Date.now();
  res.on('finish', () => {
    const cost = Date.now() - t0;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug';
    if (level === 'error') log.error(`${req.method} ${req.path} → ${res.statusCode} ${cost}ms`);
    else if (level === 'warn') log.warn(`${req.method} ${req.path} → ${res.statusCode} ${cost}ms`);
    else log.debug(`${req.method} ${req.path} → ${res.statusCode} ${cost}ms`);
  });
  next();
});

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/library', libraryRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api', apiRoutes);

// 生产环境：服务前端构建产物
// 前端静态产物目录：支持镜像内 /app/public、开发路径 ../../client/dist、PUBLIC_DIR 显式指定
const clientDist = [
  process.env.PUBLIC_DIR,
  path.join(__dirname, '..', '..', 'client', 'dist'),  // 本地开发
  path.join(__dirname, '..', 'public'),                // Docker 镜像
  path.join(__dirname, 'public'),
].find(p => p && fs.existsSync(p));

if (clientDist) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// 错误兜底
app.use((err, req, res, next) => {
  log.error(`未捕获错误: ${err.message}`, { stack: err.stack ? err.stack.split('\n').slice(0, 3).join(' | ') : null, path: req.path });
  res.status(500).json({ error: err.message || '服务器内部错误' });
});

init();
config.load();
app.listen(PORT, () => {
  log.info(`Media Renamer 服务已启动: http://localhost:${PORT}`);
  log.info(`配置目录: ${config.CONFIG_DIR}`);
  const dirs = config.get('media_dirs') || [];
  const base = (config.get('tmdb_base_url') || '默认(https://api.themoviedb.org/3)').trim();
  log.info(`TMDB API 地址: ${base}`);
  if (!config.get('tmdb_api_key')) log.warn('未配置 TMDB API Key，请登录后在设置中填写');
  if (!dirs.length) log.warn('未配置媒体目录，请登录后在设置中添加');
});
