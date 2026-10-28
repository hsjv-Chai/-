# ECS 部署与维护

本项目保留 Vinext/Worker 本地运行方式，同时提供 Next.js standalone / Node 24 的 ECS 部署方式。服务器使用 SQLite（WAL、外键、busy timeout）及磁盘图片目录。

本文使用通用配置示例。实际域名、服务器 IP、账户、证书联系人、备案资料、发布版本与备份位置应记录在私密运维文件中。仓库部署脚本包含特定环境的绑定，复用前须核对并调整路径、容器名、网络及源站地址，不能直接照搬到其他服务器。

## 配置与存储

- 构建期 `NEXT_PUBLIC_BASE_PATH` 决定入口前缀：根路径设为空，子路径可设为 `/melon`。
- 运行时路径必须与构建一致；Compose 的 `MELON_BASE_PATH` 应对应上述值。
- `MELON_PUBLIC_ORIGIN` 设置为实际 HTTPS 来源，例如 `https://example.com`，供同源校验和 Secure Cookie 使用。
- `MELON_DATA_DIR` 指定持久化目录；数据库、WAL/SHM 和上传图片应放在持久化卷中。
- `MELON_IMAGE` 指定已测试的镜像版本。不要将私密环境文件、密钥或备份打包进镜像。
- 应用端口只绑定回环地址，通过 Nginx HTTPS 反代；保留 Host，并正确设置转发协议与可信访客 IP。

根域名、证书、Cloudflare 缓存及来源限制见 [Cloudflare 接入说明](cloudflare/README.md)。
新注册必须验证邮箱，发信域名、最小权限凭证、私密变量和注册故障回退见 [邮件接入说明](mail/README.md)。缺少发信配置时不会自动降级为免验证注册，历史账户仍可登录。

## 初始化

容器启动时执行 `scripts/init-ecs.mjs`，只应用未登记的迁移并创建缺失分区。没有管理员时才初始化管理员及随机密码；重复启动不会重置账户或插入演示帖子。

初始凭据写入数据目录中的私密文件，权限为 600。通过受控渠道交付，勿公开用户名、密码文件内容或下载链接。

## 构建与启动

```sh
# 根路径构建；若使用子路径，将 BASE_PATH 改为 /melon。
docker build --build-arg BASE_PATH= -f deploy/Dockerfile -t melon-community:release .
```

参考 `deploy/compose.yml` 准备适合自己环境的 Compose 和私密环境文件，再从部署目录运行：

```sh
docker compose up -d app
docker compose ps
docker compose logs --tail 100 app
```

根路径健康接口为 `/api/health`；子路径部署时加上对应前缀。完成注册登录、图文发帖、回复、点赞、种瓜及牌室邀请等功能检查后再开放访问。

## 数据与备份

备份需要同时包含数据库及图片，并保证 SQLite 快照一致性。参考 `backup-ecs.sh`；该脚本会短暂暂停容器，执行前确认没有进行中的牌局。

备份及环境快照使用私密权限，另存到可靠位置，并定期演练恢复。公开仓库仅保存迁移与源码，不记录真实备份文件名和服务器清单。

## 更新与回退

1. 构建新镜像，在独立数据目录完成类型检查、构建与相关接口测试。
2. 安排维护时间，确认无进行中的牌局，备份数据与当前镜像、环境、Compose 和 Nginx 配置。
3. 同路径更新可参考 `update-image.sh`；它拒绝跨路径换镜像，并在健康检查失败时恢复旧版本配置。
4. 从 `/melon` 切到根路径时，必须协调更新镜像、运行参数、同源配置、Cookie 和反代，使用 [根路径接入流程](cloudflare/README.md)。
5. 回退需恢复匹配的镜像与配置，不使用旧数据库覆盖更新后的用户数据。Nginx 使用单文件挂载时应保留文件 inode。

玩法与迁移说明：[牌室](../docs/features/card-room.md)、[种瓜](../docs/features/garden.md)。测试覆盖范围：[验证记录](../docs/verification/history.md)、[根路径测试](../docs/verification/root-domain.md)。
