# ECS 部署

Cloudflare 免费代理接入准备及分阶段操作见 [Cloudflare 接入包](cloudflare/README.md)。当前尚未购买域名，生产仍使用原 IP 入口。

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
2. `sudo docker build --network host -f deploy/Dockerfile -t melon-community:<版本> .`。
3. 先备份数据，再修改 `/opt/melon/.env` 中镜像版本，执行 `sudo docker compose up -d`。
4. 检查健康端点、登录和页面。仅在新版本迁移与旧版本兼容时直接切回旧镜像。
5. 首次部署若需移除入口，从 Nginx 配置移除 `BEGIN melon-community` 到 `END melon-community` 区块；先 `nginx -t`，再平滑 reload。不要直接覆盖其他应用的后续配置更新。

官方参考：[Next.js 自托管](https://nextjs.org/docs/app/guides/self-hosting)、[Docker 的 Next.js 指南](https://docs.docker.com/guides/nextjs/)、[Node.js SQLite](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)。
