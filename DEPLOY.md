# 🚀 线上部署手册（阿里云生产机）

> 适用环境：阿里云 ECS 2C2G / 40GB，已运行 StudyLog（3000）与 Caddy（80/8443）。
> **生产目录：`/root/applications/wedding-plan`**
> **公网入口：Caddy 80（示例 `http://wedding.xiaodui.top/`）→ 本服务 `127.0.0.1:19002`**
> **分工：开发机写代码并 push；生产机只 `git pull`，禁止改代码、提交和 push。**

## 一、两台机器与隔离总览

| 项 | 开发机（当前写代码的机器） | 生产机（阿里云） |
|---|---|---|
| 角色 | 日常开发、测试 | 7×24 对外运行，只部署不开发 |
| 目录 | `/root/applications/wedding-plan` | **`/root/applications/wedding-plan`**（自包含） |
| 端口 | **19002**（`0.0.0.0`，局域网可访问） | **`127.0.0.1:19002`（仅本机）**，公网由 **Caddy 80** 反代 |
| 代码权限 | 可 commit / push | **只读：只允许 pull** |
| 数据库 | `server/data/wedding.db`（本机私有） | `server/data/wedding.db`（git 忽略，独立文件） |
| 鉴权 | 无 | **无（按要求不启用登录鉴权）** |
| 数据同步 | 首次上线时从开发机导入一次；之后两边各自独立 | 导入后与开发机物理隔离，互不影响 |

隔离保证：`server/data/`、`server/logs/`、`server/backups/`、`.env` 均在 `.gitignore` 中。
`git pull` 永远不会覆盖生产数据库；开发机的数据也不会被带到生产机。

## 二、首次部署（生产机，root 执行）

### 前置

1. 阿里云安全组已放行 **80/TCP**（Caddy 使用；8443 按现有配置保留）。
2. 生产机可访问 GitHub，并为本仓库添加 **只读 Deploy Key**：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519_github -N ""
cat ~/.ssh/id_ed25519_github.pub
# 把公钥添加到 GitHub 仓库 → Settings → Deploy keys（不要勾选 Allow write access）

cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/id_ed25519_github
  IdentitiesOnly yes
EOF
```

### 1. 登录生产机，核实环境

```bash
ss -tlnp                  # 80/8443 应为 caddy；3000 为 StudyLog；19002 应为空闲
systemctl status caddy --no-pager      # Caddy 正常运行
systemctl status studylog --no-pager   # StudyLog 正常运行，部署全程不动它
free -m                   # available 建议 ≥ 1GB
node -v                   # 必须 ≥ 22.5（使用内置 node:sqlite）
```

> ⚠️ 80 由 Caddy 占用是**正常现象**，本服务不再直接监听 80。
> 如果 19002 被其他进程占用，先停下排查；不要杀 Caddy / StudyLog。

### 2. 克隆代码到生产目录

```bash
git clone git@github.com:guojiaxian/wedding-plan.git /root/applications/wedding-plan
cd /root/applications/wedding-plan
```

### 3. 把仓库设为“只读”（禁止生产机推送）

```bash
# 让 push 直接失败；pull 不受影响
git remote set-url --push origin DISABLED
git remote -v            # fetch 为 GitHub 地址，push 显示 DISABLED 即正确
```

`deploy.sh` 还会在拉代码前检查工作区：只要生产机有未提交的本地改动，脚本会直接终止，避免“线上偷偷改代码”。

### 4. 配置 Caddy 反代

先备份并查看现有配置，**不要覆盖任何已有站点块**：

```bash
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-$(date +%F)
cat /etc/caddy/Caddyfile
ls -la /etc/caddy/
```

现有 `xiaodui.top:8443` 站点设置了 HSTS。**不要用主域名 `xiaodui.top` 的 80 端口**：
浏览器可能因 HSTS 把 `http://xiaodui.top` 强制升级到 `https://xiaodui.top:443`，而 443 当前没有站点。
请使用一个子域名（示例 `wedding.xiaodui.top`），并在 DNS 添加 A 记录指向生产机公网 IP：

```bash
dig +short wedding.xiaodui.top   # 应返回生产机 IP
```

在 Caddyfile **末尾新增**站点块（子域名换成你的）：

```caddyfile
http://wedding.xiaodui.top {
    reverse_proxy 127.0.0.1:19002
}
```

> 你贴出的现有站点地址两侧带反引号；如果 `validate` 报错指向它，去掉反引号后再试。
> 不要删除或修改已有的 `https://xiaodui.top:8443` 站点块。

校验并平滑重载（不会中断现有站点）：

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

如果 `systemctl reload caddy` 不可用，用：

```bash
caddy reload --config /etc/caddy/Caddyfile
```

> 如果不用子域名、只能用 `http://<IP>/` 访问，请先把现有 `Caddyfile` 发我确认。
> 直接在 catch-all 里加路径可能需要同时调整前端 base，不能盲目改。

### 5. 一键部署应用

```bash
./deploy/deploy.sh
```

脚本会自动完成：预检（19002 / StudyLog / Caddy / 内存 / Node）→ `git pull --ff-only` → `npm ci` → 构建前端 → 生成 `.env`（`PORT=19002`、`HOST=127.0.0.1`、`TZ=Asia/Shanghai`）→ 安装并重启 systemd 单元 `wedding-plan` → 内部健康检查与 StudyLog 零干扰验证。

首次也可只演练、不动服务：

```bash
./deploy/deploy.sh --dry-run
```

### 6. 验收

```bash
curl -s http://127.0.0.1:19002/health
# {"status":"ok","app":"wedding-plan",...}

curl -s http://wedding.xiaodui.top/health
# 经 Caddy 反代也应返回 {"status":"ok",...}

curl -s http://127.0.0.1:3000/api/v1/health
# StudyLog 仍正常

systemctl status wedding-plan --no-pager
systemctl status caddy --no-pager
```

浏览器打开 `http://wedding.xiaodui.top/` 应能看到备婚首页。首次启动会带一套模板数据，下一步会替换成真实数据。

## 三、把当前数据迁移到线上（保持隔离）

### 原理

- 生产数据库就是项目内的 `server/data/wedding.db`，**不在 git 中**，后续 `git pull` / 重新部署都不会覆盖它。
- 迁移只做**一次**：把开发机当前数据导出 → 导入生产机。导入后，生产机数据独立演进，开发机继续做本地测试数据，两边互不影响。
- 推荐使用应用自带的「JSON 备份」导入，不需要停服务、不需要手工拷数据库文件。

### 方式 A（推荐）：JSON 备份导入

**第 1 步：在开发机导出一份当前数据**

网页操作：打开 `http://<开发机IP>:19002/settings` → 点「导出备份」，得到 `wedding-backup-*.json`。

或在开发机命令行导出（本项目已生成一份当日快照，可直接用）：

```bash
cd /root/applications/wedding-plan
ls server/backups/manual-pre-online-*.json
```

**第 2 步：把备份文件传到生产机**

```bash
scp /root/applications/wedding-plan/server/backups/manual-pre-online-20261126.json \
    root@<生产机公网IP>:/root/wedding-backup.json
```

**第 3 步：在生产机上导入**

```bash
curl -s -X POST http://127.0.0.1:19002/api/backup \
  -H 'Content-Type: application/json' \
  --data-binary @/root/wedding-backup.json
# 返回 {"ok":true} 即成功
```

也可以在生产机浏览器打开 `http://wedding.xiaodui.top/settings`，用「导入备份」选择文件（文件需先下载到操作电脑上）。

> 导入会**清空并替换**生产库现有数据（包括首次启动的模板），这正是首次上线想要的效果。
> 如果之后开发机数据又有变动，重新导出再导入一次即可；导入是覆盖式的。

**第 4 步：核对**

```bash
curl -s http://127.0.0.1:19002/api/settings
# 应看到新人姓名、婚期、场地等真实数据
```

再刷新网页，检查首页倒计时、花销、物品、任务、宾客等数据是否齐全。

### 方式 B（备选）：直接复制数据库快照

适合想“原样搬库”的场景。开发机生成一致性快照：

```bash
cd /root/applications/wedding-plan
node -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('server/data/wedding.db');db.exec(\"VACUUM INTO 'server/backups/manual-pre-online.db'\")"
```

传到生产机并替换（**必须先停服务**）：

```bash
scp server/backups/manual-pre-online.db root@<生产机公网IP>:/root/wedding-snapshot.db

# 生产机
systemctl stop wedding-plan
cp /root/wedding-snapshot.db /root/applications/wedding-plan/server/data/wedding.db
rm -f /root/applications/wedding-plan/server/data/wedding.db-wal \
      /root/applications/wedding-plan/server/data/wedding.db-shm
systemctl start wedding-plan
curl -s http://127.0.0.1:19002/health
```

### 迁移后的隔离说明

- 生产机：`/root/applications/wedding-plan/server/data/wedding.db`（独立文件）
- 开发机：`/root/applications/wedding-plan/server/data/wedding.db`（独立文件）
- 两个文件都在 git 忽略列表中，**不会通过代码同步互相覆盖**
- 生产机的日志 `server/logs/`、自动备份 `server/backups/` 同样只属于生产机

## 四、日常更新（开发机改，生产机拉）

```bash
# 开发机：正常改代码并推送
cd /root/applications/wedding-plan
git add -A
git commit -m "feat: xxx"
git push origin main

# 生产机：只拉取并部署（不要在生产机改任何代码）
cd /root/applications/wedding-plan
./deploy/deploy.sh
```

更新不会影响生产数据：`git pull` 只更新代码，数据库、`.env`、日志、备份都会被保留。
若生产机工作区有本地改动，`deploy.sh` 会终止并提示先恢复干净。

### 回滚

推荐在开发机上反向提交后重新部署（生产机保持只读）：

```bash
# 开发机
git revert <要撤销的提交>
git push origin main

# 生产机
cd /root/applications/wedding-plan && ./deploy/deploy.sh
```

## 五、运维速查

```bash
systemctl status wedding-plan              # 应用状态
systemctl status caddy                     # 公网入口状态
journalctl -u wedding-plan -f              # 应用实时日志
journalctl -u caddy -f                     # Caddy 实时日志
tail -f server/logs/wedding-$(date +%F).log   # 应用文件日志（保留 14 天）
ls -t server/backups/ | head               # 每日数据库备份（保留 30 份）
curl -s http://127.0.0.1:19002/health      # 应用内部健康检查
```

## 六、常见问题

- **公网打不开？** 依次检查：`ss -tlnp` 中 Caddy 是否监听 80、`systemctl status caddy`、Caddyfile 是否有站点块、阿里云安全组是否放行 80/TCP。
- **Caddy 返回 502？** 通常是应用没启动或端口不对：`systemctl status wedding-plan`、`curl http://127.0.0.1:19002/health`。
- **80 端口被非 Caddy 进程占用？** 先停下，不要杀进程、不要改 nginx/Caddy 现有配置，联系服务器负责人。
- **部署后数据没了？** 检查是否误删 `server/data/`；生产数据不在 git 中，误删只能从 `server/backups/` 或开发机重新导入备份恢复。
- **`.env` 已存在但端口是 80 / HOST=0.0.0.0？** 这是旧的直连配置；改成 `PORT=19002`、`HOST=127.0.0.1` 后重新执行 `./deploy/deploy.sh`，或删掉 `.env` 让脚本重新生成。
- **完全退役？**

```bash
systemctl disable --now wedding-plan
rm -f /etc/systemd/system/wedding-plan.service
systemctl daemon-reload
# Caddyfile 中删除对应站点块后：systemctl reload caddy
rm -rf /root/applications/wedding-plan   # ⚠️ 含数据库，删除前先导出备份
```
