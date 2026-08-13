# ═══════════════════════════════════════════════════════════════
# Media Renamer — Docker 镜像（MoviePilot 式打包方案）
# 特性：
#   · 多架构构建（amd64 / arm64 / arm/v7）
#   · PUID/PGID 宿主权限映射（同 MoviePilot）
#   · 多阶段构建，运行时零构建工具
#   · 内置 HEALTHCHECK + OCI LABEL
# ═══════════════════════════════════════════════════════════════

# 基础镜像（可用 --build-arg NODE_IMAGE=... 切换镜像源）
ARG NODE_IMAGE=node:20-bookworm-slim

# ── Stage 1: 前端构建（Vite → dist 静态产物）──
FROM ${NODE_IMAGE} AS client-build
WORKDIR /build
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ── Stage 2: 后端构建（编译原生模块 better-sqlite3，多架构各自编译）──
FROM ${NODE_IMAGE} AS server-build
# 构建工具仅本阶段需要，不进入最终镜像
RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/src ./src

# ── Stage 3: 运行时镜像 ──
FROM ${NODE_IMAGE}

LABEL org.opencontainers.image.title="Media Renamer" \
      org.opencontainers.image.description="影视媒体文件识别与 Emby 规范重命名工具" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.source="https://github.com/media-renamer"

# 时区与权限（MoviePilot 式）
ENV TZ=Asia/Shanghai \
    PUID=0 \
    PGID=0 \
    NODE_ENV=production \
    PORT=3000 \
    CONFIG_DIR=/config \
    PUBLIC_DIR=/app/public

# 权限方案：不创建额外用户（node 镜像自带 node 用户 uid/gid 1000，避免 GID 冲突）
# runtime 阶段零 RUN：TZ 由 Node full-ICU 处理时区，权限由 setpriv 按数字 uid/gid 切换
WORKDIR /app
# 后端（含编译好的 better-sqlite3 原生模块，与基础镜像 glibc 兼容，直接可运行）
COPY --from=server-build /app/node_modules ./node_modules
COPY --from=server-build /app/src ./src
COPY server/package.json ./package.json
# 前端静态产物
COPY --from=client-build /build/dist ./public

# 入口脚本（PUID/PGID 权限适配）
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3000
VOLUME ["/config"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
