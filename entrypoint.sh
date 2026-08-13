#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# Media Renamer — 容器入口（MoviePilot 式 PUID/PGID 权限适配）
#
# 与 MoviePilot 相同的权限方案：通过 PUID/PGID 环境变量将容器运行
# 用户映射为宿主机用户，彻底解决挂载卷文件权限问题。
#   · PUID/PGID 未设置或为 0 → 以 root 运行（默认，开箱即用）
#   · PUID/PGID 设置为宿主 uid/gid（如群晖 1026:100）→ 以对应权限运行
# 实现：setpriv（util-linux 内置）按数字 uid/gid 直接切换，零额外依赖、
#       零用户/组冲突（无需创建容器用户）。
# ═══════════════════════════════════════════════════════════════
set -e

PUID="${PUID:-0}"
PGID="${PGID:-0}"

# ── 非 root：确保关键目录归目标用户可写 ──
if [ "${PUID}" != "0" ] || [ "${PGID}" != "0" ]; then
  echo "[entrypoint] 应用 PUID=${PUID} / PGID=${PGID}"
  chown -R "${PUID}:${PGID}" /config /app 2>/dev/null || true
fi

echo "[entrypoint] Media Renamer 启动，TZ=${TZ:-Asia/Shanghai}"

# ── 以目标用户运行 ──
if [ "${PUID}" = "0" ] && [ "${PGID}" = "0" ]; then
  exec node src/index.js
else
  exec setpriv --reuid "${PUID}" --regid "${PGID}" --clear-groups node src/index.js
fi
