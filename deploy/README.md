# ECS 部署

Cloudflare 免费代理接入准备及分阶段操作见 [Cloudflare 接入包](cloudflare/README.md)。根域名 `gua4u.cn` 已购买、备案待完成；根路径候选版本已准备，生产仍使用原 IP 入口。见 [本次验收记录](cloudflare/VERIFICATION-ROOT.md)。

本项目同时保留原 Vinext/Worker 本地运行方式，并提供 Next.js standalone / Node 24 的 ECS 生产方式。生产使用 `node:sqlite`（WAL、外键、5 秒 busy timeout）与磁盘图片目录。事务适配层保证帖子与图片关联批量写入原子性。

## 当前布局

- 公网入口：`https://114.215.182.66/melon/`（规范路径可能跳转至 `/melon`）。
- 应用目录：`/opt/melon`；Compose：`/opt/melon/compose.yml`；版本由 `/opt/melon/.env` 中 `MELON_IMAGE` 指定。
- 数据目录：`/opt/melon/data`，其中 `melon.sqlite` 及 WAL/SHM 为数据库，`uploads/` 为图片。
- 网络：加入已有 `moye_default`，别名 `melon-app`；3100 端口仅绑定服务器回环地址。
- Nginx：在 `/opt/moye/deploy/nginx.conf` 的 HTTPS server 中加入 `nginx-location.conf`；不覆盖原有 location。通过 Docker DNS 动态解析应用地址。
- HTTPS 沿用现有 IP 证书及其续期流程。公网仅通过原 80/443 入口。
- 容器使用非 root 用户，移除 Linux capabilities，设置重启策略、健康检查及日志轮转。

## 初始化

容器每次启动运行 `scripts/init-ecs.mjs`。只应用尚未登记的迁移、创建缺失分区；仅在不存在管理员时创建 `melon_admin` 和随机强密码。密码文件保存在 `/opt/melon/data/initial-admin.txt`，权限 600。重复启动不会重置账户或插入演示帖子。

`NEXT_PUBLIC_BASE_PATH=/melon` 是构建期配置；`MELON_PUBLIC_ORIGIN=https://114.215.182.66` 是请求来源校验与 Secure Cookie 的生产依据。反代必须保留 Host 并设置 X-Forwarded-Proto。

## 操作

```sh
cd /opt/melon
sudo docker compose ps
sudo docker compose logs --tail 100 app
sudo docker compose restart app
curl -fsS https://114.215.182.66/melon/api/health
sudo sh /opt/melon/backup-ecs.sh
```

备份脚本短暂暂停论坛容器，将整个数据目录一致性打包到 `backups/` 后恢复。备份包含账户数据及初始密码文件，权限为 600。不要公开备份或提交到代码仓库。

## 更新与回退

1. 上传不含 `node_modules`、本地数据、输出文件、环境文件、密钥的源代码到新的 `releases/<版本>/`。
2. 旧入口构建：`sudo docker build --network host --build-arg BASE_PATH=/melon -f deploy/Dockerfile -t melon-community:<版本> .`。根域名候选构建改用 `--build-arg BASE_PATH=`，必须与运行时空 `MELON_BASE_PATH` 一致；路径切换只能使用 Cloudflare 接入包的协调激活流程。
3. 先备份数据，再修改 `/opt/melon/.env` 中镜像版本，执行 `sudo docker compose up -d`。
4. 检查健康端点、登录和页面。仅在新版本迁移与旧版本兼容时直接切回旧镜像。
5. 首次部署若需移除入口，从 Nginx 配置移除 `BEGIN melon-community` 到 `END melon-community` 区块；先 `nginx -t`，再平滑 reload。不要直接覆盖其他应用的后续配置更新。

官方参考：[Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)、[Docker 的 Next.js 指南](https://docs.docker.com/guides/nextjs/)、[Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)。

## 牌室版本

牌室亮牌版本镜像为 `melon-community:20261023-reveal-v1`，源代码位于 `/opt/melon/releases/20261023-reveal-v1`，入口 `https://114.215.182.66/melon/games`。迁移只增加 `game_rooms` 表；旧 BBS 表未改动。

`update-image.sh` 用于切换已在隔离数据上验收过、迁移向后兼容的镜像；以 root 运行，参数为 `melon-community:<版本>`。它备份整个数据目录及原 `.env`（不输出内容），修改镜像变量、仅重建论坛容器，健康检查失败则自动恢复原镜像配置。上一个版本为 `melon-community:20261022-cards-v1`；若需回退，可用同一脚本切换旧镜像，保留新增表，不恢复旧数据库覆盖新内容。

打包构建源码时需包含 `.openai/hosting.json`（只有本地 DB/BUCKET 绑定名称，供 Vite 配置类型检查使用），排除环境文件、用户数据、输出目录及密钥。

## 种瓜版本

种瓜首发镜像 `melon-community:20261023-garden-v1`，源代码 `/opt/melon/releases/20261023-garden-v1`，入口 `https://114.215.182.66/melon/garden/`。迁移 `0002_narrow_blob` 仅新增 `garden_check_ins`；没有修改牌室规则或运行牌室测试。

2026-10-23 14:22（北京时间）发布，镜像 SHA256 `37de5a1efac9aadbe699125b46ec698d30b5e7740ac9935e83ad1eadfc465e5b`。发布前检查无进行中牌局。数据备份 `/opt/melon/backups/melon-data-20261023T062222Z.tar.gz`；旧镜像配置 `/opt/melon/backups/env-before-20261023T062222Z`。

回退命令：`sudo sh /opt/melon/update-image.sh melon-community:20261023-reveal-v1`。回退也应避开进行中的牌局。新增签到表可保留，不要用旧数据库覆盖上线后用户内容。玩法与接口测试见 `GARDEN.md`；代理限制及验收边界见 `VERIFICATION.md`。

## 单房间占座修复（当前）

2026-10-23 16:43（北京时间）上线 `melon-community:20261023-single-room-a70bf46`。应用源码对应 GitHub main 的 `a70bf465523dca100da84f16e0ecb949bed8b722`（快进合入“千手观音bug修补”两个提交）；本节及验证记录为随后补充的发布文档，不改变运行代码。

- 源码：`/opt/melon/releases/20261023-single-room-a70bf46`。
- 镜像 SHA256：`108ddcd917d6ce503459b1a9a15c1ff7494d40942c50ec950a0177a32e3859d7`，镜像标签 `org.opencontainers.image.revision` 记录上述提交。
- 数据备份：`/opt/melon/backups/melon-data-20261023T084331Z.tar.gz`；旧镜像配置：`/opt/melon/backups/env-before-20261023T084331Z`。
- 无新增数据库迁移。发布前无进行中对局。已存在的历史重复座位需由参与者退出多余房间；修复保留退出操作，不自动清空房间。
- 回退：确认无进行中对局后执行 `sudo sh /opt/melon/update-image.sh melon-community:20261023-garden-v1`。保留当前数据库，不用旧备份覆盖新用户内容；回退也会恢复旧版重复占座漏洞，仅用于紧急恢复。

访问入口仍为 `https://114.215.182.66/melon/games`。本轮验收使用隔离容器接口及 ECS 本机 HTTPS 检查，未使用受全局代理影响的浏览器。
