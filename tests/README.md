# 测试导航

| 目录/命令 | 目的 |
| --- | --- |
| `unit/` · `test:games` / `test:garden` | 不启动服务的牌局与日期/成长规则 |
| `unit/` · `test:boundaries` | 客户端依赖隔离、社区模块无循环依赖 |
| `integration/` · `test:integration` / `test:ecs` | 论坛两账户、图文、权限、搜索、分页与管理 |
| `integration/` · `test:api-routing` | 统一入口的同源检查、异步错误和 404 契约 |
| `integration/` · `test:single-room` / `test:games-api` | 占座并发与两种完整牌局 |
| `integration/` · `test:garden-api` | 并发签到、账户隔离及重启后的状态 |
| `integration/` · `test:root-domain` | 根路径、资源、Secure Cookie、来源及页脚 |
| `integration/test-ecs-persistence.mjs` | prepare → 实际重启 → verify 的完整持久化检查 |
| `fixtures/image.png` | 最小有效 PNG，供图片上传与持久化测试使用，无个人内容 |

运行步骤和环境变量见 [开发指南](../docs/development.md)。接口测试只使用独立数据；部分测试会直接写数据库，绝不能指向生产。保留既有 npm 命令名称，旧 `scripts/test-*` 文件已迁移，不再作为入口。

部署工具的 Python/Nginx 测试继续与 `deploy/cloudflare/` 内脚本放在一起。`beta/` 的历史测试快照不参与执行。
