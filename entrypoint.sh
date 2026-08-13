#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Media Renamer — 容器入口（MoviePilot 式 PUID/PGID 权限适配）
#
# 与 MoviePilot 相同的权限方案：通过 PUID/PGID 环境变量将容器内
# 运行用户映射为宿主机用户，彻底解决挂载卷文件权限问题。
#   · PUID/PGID 未设置或为 0 → 以 root 运行（默认，开箱即用）
#   · PUID/PGID 设置为宿主 uid/gid（如群晖 1026）→ 以对应权限运行
# ═══════════════════════════════════════════════════════════════
set -e

PUID="${PUID:-0}"
PGID="${PGID:-0}"

# ── 权限适配：映射宿主 uid/gid 到容器用户 mediauser ──
if [ "${PUID}" != "0" ] || [ "${PGID}" != "0" ]; then
  echo "[entrypoint] 应用 PUID=${PUID} / PGID=${PGID}"
  groupmod -o -g "${PGID}" mediauser 2>/dev/null || true
  usermod -o -u "${PUID}" -g "${PGID}" mediauser 2>/dev/null || true
  # 确保关键目录可写
  chown -R mediauser:mediauser /config /app 2>/dev/null || true
fi

echo "[entrypoint] Media Renamer 启动，TZ=${TZ:-Asia/Shanghai}"

# ── 以目标用户运行 ──
if [ "${PUID}" = "0" ] && [ "${PGID}" = "0" ]; then
  exec node src/index.js
else
  exec su-exec mediauser:mediauser node src/index.js
fi
