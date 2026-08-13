# Media Renamer · 影视媒体识别与规范重命名

基于 TMDB 元数据、遵循 [Emby 官方命名规范](https://emby.media/support/articles/Movie-Naming.html) 的影视文件整理工具。

## ✨ 特性

- 🎬 **智能识别**：自研正则解析器，支持 Emby 全部命名约定（SxxExx / 1x02 / 102 / 日期命名 / 多集 / 多版本 / 特典）
- 🔍 **TMDB 自动匹配**：基于电影/剧集名 + 年份，自动检索元数据；支持中文/英文双查
- ✍️ **Emby 规范重命名**：电影 `Avatar (2009) [tmdbid=19995].mkv` + 独立文件夹；剧集 `Glee (2009)\Season 1\Glee S01E01 - Pilot.mkv`；多集 `S01E02-E03`；特典 `S00E01`
- 📂 **自动整理 + 清理**：重命名后自动清理空文件夹——每集分散在独立文件夹的散乱剧集，执行重命名后自动归入 `剧名 (年份)\Season N\`，并删除无用空目录（非空目录、媒体根目录受保护不误删）
- 🍎 **Apple Liquid Glass UI**：冷灰白调、玻璃毛玻璃导航、统一面板 + hairline 分割线
- 🔐 **首次启动引导创建管理员**：无 Web 注册入口，单用户系统
- 📦 **Docker 一键部署**：多阶段构建，挂载配置与媒体卷
- 💾 **SQLite + 配置文件**：零依赖单文件数据库，配置文件 `config.json` 持久化

## 🚀 快速开始（Docker）

**自包含镜像**：构建产物即最终可运行镜像，内含全部运行依赖（Node 运行时 + npm 依赖 + 编译好的 better-sqlite3 原生模块 + 前端页面），**`docker run` 直接启动，运行时零额外安装、零下载**。

```bash
# ── 构建 ──
# 方式一：compose 编排（含卷挂载）
docker compose up -d --build

# 方式二：手动构建（多架构）
docker build --build-arg NODE_IMAGE=docker.1panel.live/library/node:20-slim -t media-renamer:latest .
# 多架构（amd64/arm64/armv7）：
docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 -t media-renamer:latest .

# ── 直接启动（无需 compose，一条命令）──
docker run -d --name media-renamer --restart unless-stopped \
  -e PUID=0 -e PGID=0 \
  -p 3000:3000 \
  -v /path/to/config:/config \
  -v /path/to/your/movies:/media \
  media-renamer:latest
```

浏览器访问 http://localhost:3000，首次启动会引导创建管理员账号。镜像内置健康检查（`docker inspect` 可见 HEALTHCHECK）与 OCI 标准元数据 LABEL。

**权限（同 MoviePilot）**：通过 `PUID` / `PGID` 环境变量将容器运行用户映射为宿主机用户，避免挂载卷权限问题——Linux 用 `id -u` / `id -g` 查 uid/gid（群晖默认 `1026:100`）。不设置则默认 root 运行。

**离线分发**（NAS 无外网时）：
```bash
# 构建机导出 → 拷贝 tar → 目标机导入
docker save -o media-renamer.tar media-renamer:latest
docker load -i media-renamer.tar
```

媒体目录默认未挂载，按需编辑 `docker-compose.yml` 取消注释 `/path/to/your/movies:/media/movies:ro` 行。

> **构建报错 `docker.fnnas.com 401 Unauthorized`？**
> 这是 NAS 自带镜像代理认证失败所致。compose 已默认使用公共加速源 `docker.1panel.live` 拉取基础镜像；
> 若需更换，修改 `docker-compose.yml` 中 `build.args.NODE_IMAGE`，备选：`docker.1ms.run`、`docker.m.daocloud.io`。
> 验证某个源是否可用：`curl -I https://<源>/v2/library/node/manifests/20-slim`（返回 200 即可用）。
> 可直连 Docker Hub 的环境：删除 `NODE_IMAGE` 行即可用官方源。

## 🤖 镜像自动发布（GitHub Actions）

镜像构建与发布已封装为 CI（`.github/workflows/docker-build.yml`，MoviePilot 同款方案），push 到 GitHub 后自动构建**多架构镜像**并推送 **Docker Hub + GHCR**：

1. 推送代码到 GitHub 仓库（master 分支）
2. 配置仓库 Secrets：`DOCKER_USERNAME`、`DOCKER_PASSWORD`（Docker Hub 账号）
3. 发布版本：打标签 `git tag v1.0.0 && git push --tags` → 自动构建 `v1.0.0` 镜像；master 分支更新自动构建 `latest`
4. 拉取镜像：`docker pull <你的用户名>/media-renamer:latest` 或 `ghcr.io/<你的用户名>/<仓库>:latest`

## 🛠 本地开发

```bash
# 后端
cd server && npm install && npm run dev

# 前端（另开终端）
cd client && npm install && npm run dev
# 访问 http://localhost:5173
```

环境变量：
- `CONFIG_DIR`：配置与数据库目录（默认 `./data`，Docker 默认 `/config`）
- `PORT`：服务端口（默认 `3000`）
- `JWT_SECRET`：JWT 签名密钥（生产环境必须修改）

## 📂 目录结构

```
media-renamer/
├── Dockerfile                 # 多阶段构建（前端构建 + 后端运行）
├── docker-compose.yml         # 一键编排
├── server/
│   ├── src/
│   │   ├── index.js           # Express 入口
│   │   ├── db.js              # SQLite 初始化
│   │   ├── config.js          # 配置文件读写
│   │   ├── middleware/auth.js # JWT 鉴权
│   │   ├── routes/            # API 路由
│   │   └── services/
│   │       ├── parser.js      # 文件名解析（Emby 全部命名约定）
│   │       ├── scanner.js     # 媒体目录扫描
│   │       ├── tmdb.js        # TMDB v3 API
│   │       └── renamer.js     # Emby 规范路径生成 + 执行
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx            # 路由 + 启动引导判断
    │   ├── api.js             # fetch 封装
    │   ├── styles/app.css     # Apple Liquid Glass token 体系
    │   └── pages/
    │       ├── Setup.jsx      # 首次引导（创建管理员）
    │       ├── Login.jsx
    │       ├── Dashboard.jsx
    │       ├── Library.jsx    # 媒体库 + 匹配 + 重命名工作流
    │       └── Settings.jsx   # TMDB key / 媒体目录 / 命名模式
    └── package.json
```

## 🎯 使用流程

1. **首次启动**：浏览器自动跳到引导页，创建管理员账号
2. **设置页**：填入 TMDB API Key（在 [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) 免费申请）→ 点击「浏览…」通过**文件系统目录选择器**选择媒体文件夹（支持盘符 / 上级 / 根目录导航）→ 选择重命名模式
3. **仪表盘**：点击「扫描媒体库」，等待扫描完成
4. **媒体库**：批量自动匹配 TMDB → 手动修正（点击「手动匹配」搜索确认）→ 点击「重命名预览」查看 diff → 确认执行
5. **结果**：原文件按 Emby 规范重命名（带 `[tmdbid=xxx]` 元数据标签），移动日志可在仪表盘查看

## 🏷 Emby 命名约定支持

| 输入示例 | 类型 | 生成结果 |
|---|---|---|
| `Avatar (2009).mkv` | 电影 | `Movies\Avatar (2009)\Avatar (2009) [tmdbid=19995].mkv` |
| `Avatar (2009) - 1080p.mkv` | 电影多版本 | `Movies\Avatar (2009)\Avatar (2009) - 1080p [tmdbid=19995].mkv` |
| `Glee.S01E01.Pilot.mkv` | 剧集 | `TV\Glee (2009)\Season 1\Glee S01E01 - Pilot.mkv` |
| `Breaking Bad S01E02-E03.mkv` | 剧集多集 | `TV\Breaking Bad (2008)\Season 1\Breaking Bad S01E02-E03.mkv` |
| `The Blue Planet s00e01.mkv` | 特典 | `TV\The Blue Planet (2001)\Specials\The Blue Planet S00E01.mkv` |
| `Daily.Show.1996-11-14.mp4` | 日期命名 | `TV\Daily Show (1996)\Daily Show 1996-11-14.mp4` |
| `Seinfeld.102.mkv` | 3 位简写 | `TV\Seinfeld (1989)\Season 1\Seinfeld S01E02.mkv` |
| `anything_1x02.ext` | 1x02 | `TV\...\Season 1\... S01E02.ext` |

## ⚠️ 已知限制

- 单管理员系统，无多用户/权限管理
- 自动匹配可能误识别（同名/同年份/多版本），匹配后请人工确认再重命名
- 字幕文件未做特殊处理（与视频文件独立处理）
- extras/花絮目录会被标记但跳过大批量扫描（不会被主扫描条目干扰）
- 名称清洗：`/ \ : * ? " < > |` 等 Windows 非法字符会被替换为空格

## 📜 许可

仅供个人整理影视媒体使用，请遵守当地法律法规。