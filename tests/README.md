# 测试导航

合种新增 `test:cooperative`（真实 SQLite 多连接竞争与旧库兼容）、`test:cooperative-api`（隔离 HTTP 及实际重启后验证）、`test:cooperative-d1`（强制 Wrangler `--local` 的独立 D1 模拟目录）。见 [合种说明](../docs/features/cooperative-garden.md) 和 [验证结果](../docs/verification/cooperative-garden.md)。

| 目录/命令 | 目的 |
| --- | --- |
| `unit/` · `test:games` / `test:garden` | 不启动服务的牌局与日期/成长规则 |
| `unit/` · `test:boundaries` | 客户端依赖隔离、社区模块无循环依赖 |
| `unit/` · `test:museum` | 博物馆草稿/发布校验、图片字段限制、旧库迁移兼容 |
| `integration/` · `test:museum-api` | 策展、原子发布、并发版本冲突、私密图片、权限、分页；实际重启后运行 `--after-restart` |
| `unit/` · `test:email` | 邮箱归一化、验证码生命周期与并发、累计名额、发送限额及 HTTP 发信适配器 |
| `integration/` · `test:email-api` | 真实 HTTP 的必填验证、同源、隐私、管理员邮箱筛选；重启后再运行 `--after-restart` |
| `integration/` · `test:email-production` | 隔离生产构建拒绝模拟发信与注册降级，保留旧账号登录；只用于故意配置 preview 的独立生产夹具 |
| `integration/` · `test:integration` / `test:ecs` | 论坛两账户、图文、权限、搜索、分页与管理 |
| `integration/` · `test:api-routing` | 统一入口的同源检查、异步错误和 404 契约 |
| `integration/` · `test:single-room` / `test:games-api` | 占座并发与两种完整牌局 |
| `integration/` · `test:garden-api` | 并发签到、账户隔离及重启后的状态 |
| `integration/` · `test:root-domain` | 根路径、资源、Secure Cookie、来源及页脚 |
| `integration/test-ecs-persistence.mjs` | prepare → 实际重启 → verify 的完整持久化检查 |
| `fixtures/image.png` | 最小有效 PNG，供图片上传与持久化测试使用，无个人内容 |

运行步骤和环境变量见 [开发指南](../docs/development.md)。接口测试只使用独立数据；部分测试会直接写数据库，绝不能指向生产。保留既有 npm 命令名称，旧 `scripts/test-*` 文件已迁移，不再作为入口。

`helpers/verified-registration.mjs` 只在 `MELON_EMAIL_TEST_OUTBOX=1`、回环 URL、含 `email-qa` 的独立 Node 数据目录三项同时满足时，为既有回归脚本补充邮箱验证流程。它调用真实发码接口后读取开发私有收件箱，没有 HTTP 验证绕过开关。`test:email-api` 使用原生请求，单独检查缺少验证码的注册确实失败。

部署工具的 Python/Nginx 测试继续与 `deploy/cloudflare/` 内脚本放在一起。`beta/` 的历史测试快照不参与执行。
