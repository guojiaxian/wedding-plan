#!/usr/bin/env bash
# ============================================================
# 备婚计划 · 一键部署脚本（生产机专用；本脚本为本项目独立编写，
# 未参考/复用 StudyLog 的 deploy 脚本，服务名/端口/目录/单元名均不同）
#
# 约束来源：《新服务环境准备要求.md》
#   - 自包含：代码/依赖/数据/日志/备份全部在本仓库目录内
#   - 不触碰 /root/studylog 及其任何文件（仅做只读健康探测用于零干扰证明）
#   - 不改系统 Node / 不 npm i -g / 不装常驻数据库 / 不改系统配置
#   - systemd 新增单元 wedding-plan.service（MemoryMax=400M）
#   - 端口 19002；SQLite 单文件（node:sqlite WAL），位于 server/data/
#
# 用法：
#   ./deploy/deploy.sh             # 完整部署：拉代码 → 构建 → 重启服务 → 自检
#   ./deploy/deploy.sh --dry-run   # 只做预检与构建，不改动 systemd/服务
# ============================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="wedding-plan"
PORT="${PORT:-19002}"
NODE_BIN="/usr/bin/node"
STUDYLOG_HEALTH="http://127.0.0.1:3000/api/v1/health"
UNIT_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
cd "$APP_DIR"

say()  { echo -e "\033[1;32m[部署]\033[0m $*"; }
warn() { echo -e "\033[1;33m[警告]\033[0m $*"; }
die()  { echo -e "\033[1;31m[终止]\033[0m $*"; exit 1; }

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

# ---------- 红线自检：部署目录不得位于 /root/studylog 内（文档 3.6/3.7） ----------
case "$APP_DIR" in
  /root/studylog|/root/studylog/*) die "部署目录不得位于 /root/studylog 内（红线 3.6）" ;;
esac
say "部署目录: $APP_DIR（自包含：代码/数据/日志/备份均在其内）"

# ---------- 1. 部署前检查（文档 8 节） ----------
say "[1/7] 部署前检查"

if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
  if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    say "端口 ${PORT} 由本服务占用，稍后将以重启方式更新"
  else
    die "端口 ${PORT} 已被其他进程占用，禁止抢占（红线 3.3）。请用 ss -tlnp 排查并联系服务器负责人"
  fi
else
  say "端口 ${PORT} 空闲 ✓"
fi

HAVE_STUDYLOG=0
if systemctl list-unit-files 2>/dev/null | grep -q '^studylog\.service'; then
  HAVE_STUDYLOG=1
  if systemctl is-active --quiet studylog; then
    say "StudyLog 运行中 ✓（全程不 stop/restart/kill，不读写其文件）"
  else
    die "检测到 studylog 单元未在运行——按文档第 9 节应停止部署并联系负责人"
  fi
else
  warn "未检测到 studylog 单元（当前可能不是生产机），跳过相关检查"
fi

AVAIL_MB=$(free -m | awk '/^Mem:/{print $7}')
say "内存 available: ${AVAIL_MB}MB"
[ "$AVAIL_MB" -ge 1000 ] || die "可用内存不足 1GB（文档 8 节），先停下汇报，不得强行部署"

[ -x "$NODE_BIN" ] || NODE_BIN="$(command -v node)"
NODE_BEFORE="$("$NODE_BIN" -v)"
say "Node 版本: ${NODE_BEFORE}（共用系统 Node，部署前后必须一致）"

# ---------- 2. 拉取代码 ----------
say "[2/7] 同步代码"
if [ -d .git ]; then
  git pull --ff-only origin "${BRANCH:-main}"
else
  warn "当前目录不是 git 仓库，跳过拉取，使用现有代码"
fi

# ---------- 3. 安装依赖（项目独立 node_modules，禁止全局安装） ----------
say "[3/7] 安装依赖（npm ci，仅本项目 node_modules）"
npm ci --no-fund --no-audit

# ---------- 4. 构建前端并清理 devDependencies ----------
say "[4/7] 构建前端（堆内存限 512MB，适配 2G 机器）"
NODE_OPTIONS="--max-old-space-size=512" npm run build
say "清理 devDependencies（构建产物已生成，仅保留运行时依赖）"
npm prune --omit=dev

if [ "$DRY_RUN" = "1" ]; then
  say "--dry-run 完成：预检与构建通过，未改动 systemd/服务。"
  exit 0
fi

# ---------- 5. 生成 .env（自包含，不入 git） ----------
say "[5/7] 环境配置"
if [ ! -f .env ]; then
  cp deploy/env.example .env
  say "已从 deploy/env.example 生成 .env（TZ=Asia/Shanghai, PORT=${PORT}）"
else
  say ".env 已存在，保持不变（数据库与配置不随代码更新而丢失）"
fi

# ---------- 6. 安装/更新 systemd 单元并重启（新增单元，不动已有单元） ----------
say "[6/7] 更新并重启服务 ${SERVICE_NAME}"
sed "s|__APP_DIR__|${APP_DIR}|g" deploy/wedding-plan.service > "$UNIT_FILE"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}.service" >/dev/null 2>&1
systemctl restart "${SERVICE_NAME}.service"
sleep 2
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  die "服务启动失败，见上方日志"
fi
say "服务已重启并处于运行状态 ✓"

# ---------- 7. 部署后自检（文档 8 节回归验证） ----------
say "[7/7] 部署后自检"
HEALTH="$(curl -sf "http://127.0.0.1:${PORT}/health")" || {
  journalctl -u "$SERVICE_NAME" -n 30 --no-pager || true
  die "新服务 /health 检查失败"
}
say "新服务健康: ${HEALTH}"

if [ "$HAVE_STUDYLOG" = "1" ]; then
  SL="$(curl -sf "$STUDYLOG_HEALTH" || true)"
  if echo "$SL" | grep -q '"ok"'; then
    say "零干扰证明 · StudyLog 仍正常: ${SL}"
  else
    warn "StudyLog 健康检查无响应（响应: ${SL:-无}）"
    warn "按文档 8 节判定部署失败：立即回滚新服务 → systemctl stop ${SERVICE_NAME}，并联系负责人"
    die "StudyLog 受到影响"
  fi
  say "StudyLog 启动时间（应保持连续）: $(systemctl show studylog -p ActiveEnterTimestamp --value)"
fi

AVAIL_AFTER=$(free -m | awk '/^Mem:/{print $7}')
say "部署后内存 available: ${AVAIL_AFTER}MB"
say "Node 版本核对: 部署前 ${NODE_BEFORE} / 部署后 $("$NODE_BIN" -v)"

echo ""
say "✅ 部署完成：http://127.0.0.1:${PORT} （局域网/公网访问需服务器 IP + 阿里云安全组放行 ${PORT}/TCP，由负责人操作）"
say "   数据库: ${APP_DIR}/server/data/（不入 git，与开发环境物理隔离）"
say "   日志:   ${APP_DIR}/logs/（按天轮转，保留 14 天）；每日备份: ${APP_DIR}/backups/（保留 30 份）"
