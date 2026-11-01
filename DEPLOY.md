# 🚀 线上部署手册（阿里云生产机）

> 适用环境：阿里云 ECS 2C2G / 40GB，已运行 StudyLog（3000 端口）。
> 全部操作遵守《[新服务环境准备要求.md](./新服务环境准备要求.md)》红线。
> **分工：开发机（当前服务器）只写代码；生产机只跑 `deploy/deploy.sh`，不改代码。**

## 一、架构与隔离总览

| 项 | 开发机（当前服务器） | 生产机（阿里云） |
|---|---|---|
| 角色 | 日常开发、测试 | 7×24 运行，只部署不开发 |
| 目录 | 任意（如 `/root/wedding-plan`） | **`/root/wedding-plan`**（自包含） |
| 数据库 | `server/data/wedding.db`（本机私有） | `server/data/wedding.db`（**git 忽略，与线下物理隔离**） |
| 端口 | 19002（开发实例） | **19002**（systemd `wedding-plan.service`） |
| 数据同步 | 如需迁移：设置页「导出备份」→ 生产机设置页「导入备份」 | 每日自动备份 `backups/`（保留 30 份） |

红线对照：不碰 `/root/studylog`（部署脚本仅对其做只读健康探测）✓ · 共用系统 Node（无原生模块，无需编译）✓ · 端口 19002（文档指定）✓ · systemd 新单元含 `MemoryMax=400M` ✓ · 纯 JS 依赖（express 1 个运行时依赖）✓ · 日志按天轮转保留 14 天 ✓ · 备份保留 30 份 ✓

## 二、首次部署（生产机，约 5 分钟）

### 前置（由服务器负责人操作）

1. 阿里云安全组放行 **19002/TCP**（文档 3.4：安全组由负责人修改）。
2. 生产机可访问 GitHub；建议为本仓库添加 **只读 Deploy Key**：

```bash
# 生产机上生成密钥并把公钥添加到 GitHub 仓库 → Settings → Deploy keys（勾选只读）
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
```

### 部署步骤（生产机 root 执行）

```bash
# 1. 克隆（目录自包含，与 /root/studylog 平级互不嵌套）
git clone git@github.com:guojiaxian/wedding-plan.git /root/wedding-plan
cd /root/wedding-plan

# 2. 一键部署（自动完成：预检 → 拉代码 → npm ci → 构建 → 清理 devDeps → 装服务 → 重启 → 自检）
./deploy/deploy.sh

# 首次也可先演练，不动服务：
./deploy/deploy.sh --dry-run
```

脚本会自动：生成 `.env`（TZ=Asia/Shanghai / PORT=19002）、安装 systemd 单元
`wedding-plan.service`（`MemoryMax=400M`）、重启服务、执行文档第 8 节全部自检
（含 **StudyLog 零干扰证明**——若 StudyLog 健康检查失败，脚本会提示立即回滚）。

## 三、日常更新（开发 → 上线）

```bash
# 开发机：改代码 → 提交推送
git add -A && git commit -m "feat: xxx" && git push origin main

# 生产机：一键更新（数据库/日志/备份/ .env 均不受影响）
cd /root/wedding-plan && ./deploy/deploy.sh
```

## 四、部署自检清单（对应文档第 8 节）

- [x] `ss -tlnp`：19002 空闲或为本服务占用（脚本自动检查，被他人占用即终止）
- [x] StudyLog 在跑且未被动过（脚本自动检查并做部署后回归）
- [x] `free -m` available ≥ 1GB（不足即终止）
- [x] 无 `npm i -g`、系统 Node 版本部署前后一致（脚本自动核对输出）
- [x] 无常驻数据库/中间件（SQLite 单文件 WAL）
- [x] systemd 单元含 `MemoryMax=400M`，单元名/描述无 "studylog" 字样
- [x] `.env` 独立，`TZ=Asia/Shanghai`，端口 19002
- [x] `curl 127.0.0.1:19002/health` → `{"status":"ok",...}`
- [x] `curl 127.0.0.1:3000/api/v1/health` → StudyLog 仍 `{"status":"ok",...}`
- [ ] 填写文档文末「服务登记表」回传负责人

## 五、运维速查

```bash
systemctl status wedding-plan          # 服务状态
journalctl -u wedding-plan -f          # 实时日志（文件日志在 logs/，保留 14 天）
ls -t server/backups/ | head           # 每日备份（保留 30 份）
vim .env && systemctl restart wedding-plan   # 改配置（如换端口）

# 回滚版本
cd /root/wedding-plan
git log --oneline -5
git checkout <旧提交> && ./deploy/deploy.sh && git checkout main

# 完全退役（文档 7 节：不留系统残渣）
systemctl disable --now wedding-plan
sudo rm /etc/systemd/system/wedding-plan.service && systemctl daemon-reload
rm -rf /root/wedding-plan   # ⚠️ 含数据库，退役前先在网页设置页导出备份
```

## 六、常见问题

- **公网访问不了？** 服务监听 `0.0.0.0:19002`，需负责人在阿里云安全组放行 19002/TCP（文档红线，开发者不可自行修改）。
- **端口被占用？** 脚本直接终止并提示，用 `ss -tlnp` 排查；禁止换端口硬抢（文档第 9 节，冲突一律联系负责人）。
- **生产数据想改到本地调试？** 生产机：设置页「导出备份」→ 开发机「导入备份」。数据库文件本身永不入 git，线上/线下天然隔离。
- **构建内存不足？** 脚本已限堆 512MB 并在构建后删除 devDependencies；仍失败则用 `--dry-run` 排查或联系负责人。
