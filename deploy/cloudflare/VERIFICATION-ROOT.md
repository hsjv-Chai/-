# gua4u.cn 根路径准备记录（2026-10-25）

## 发布状态

**已完成准备，未正式切换。** 域名已购买，备案和阿里云接入仍待确认。生产保持 `https://114.215.182.66/melon/`，目标入口为 `https://gua4u.cn/`。本轮没有修改生产环境变量、Compose、Nginx、DNS、证书或用户数据，没有重启生产应用。

- 现有生产镜像：`melon-community:20261023-single-room-a70bf46`，检查为 healthy。
- 根路径候选镜像（ECS 已构建）：`melon-community:20261025-root-domain-qa`。
- 候选镜像 SHA256：`07dc28f6190a460aee9c4523f0ec19aa2ed59d43c829bf2d6da378dfa85fd3d7`。
- 根路径使用空 `NEXT_PUBLIC_BASE_PATH`；镜像标签 `io.melon.base-path` 为空。
- 准备源码目录：`/opt/melon/releases/20261025-root-domain-ready`。候选镜像包含本次应用和 Docker 变更；完整交付目录同时包含增补的测试、脚本和文档。
- 待审阅 Nginx/DNS/缓存包：`/opt/melon/releases/20261025-root-domain-ready/prepared-direct/`，未激活；超过 24 小时后需从最新配置重新生成。
- 私密备案/联系配置：本机 `.sites-runtime/domain/gua4u.cn-readiness.json`，600 权限，批准标记均为 false。联系邮箱未进入版本控制。

## 已完成的验证

| 验证 | 实际结果 |
| --- | --- |
| 根路径 Next.js 正式构建 | 本机与 ECS Docker 均成功 |
| TypeScript | `npm run typecheck` 通过 |
| Python 配置、权限、切换及回退 | 14 组通过；覆盖根域名归属、备案门禁、进行中牌局阻止激活、失败恢复镜像/来源/路径/Compose/Nginx、保留 inode |
| 性能比较工具 | 2 组通过，要求两个真实网络及相近采样时间；这不是实际网络性能验收 |
| 论坛接口与数据完整性 | 根路径隔离服务 81 项断言通过，包含注册、发帖、图片、搜索、分页、权限及隐藏图片等 |
| 单房间约束 | 根路径隔离服务 85 项断言通过 |
| 种瓜 | 单元测试 5 组、接口 96 项、实际重启后 16 项通过 |
| 牌室 | 单元测试 19 组、根路径接口 1278 项通过；两种牌局、邀请对应房间接口、并发加入、隐私、操作、下一局进贡与重连 |
| 根域名契约 | ECS 候选容器 46 项通过：根页面/资源/房间链接、运行时备案页脚、Secure + HttpOnly + SameSite=Lax + Path=/、旧 IP 来源与伪造域名写请求被拒、个人接口 no-store |
| Nginx direct / proxied 隔离 | 合计 223 项：direct 可信 66 / 非可信 65，proxied 非可信 26 / 可信 66 |

Nginx 测试读取现有生产布局作为基线，在临时 Docker 网络、模拟后端及自签名测试证书上运行，不映射主机端口。验证旧 IP 和域名的 `/melon` GET/HEAD → 302、no-store、路径/查询/转义字符保留，旧路径写入 JSON 410，普通前缀不误匹配，静态成功响应长期缓存、静态错误及动态内容不缓存，可信连接才可设置访客 IP，伪造头不能绕过来源限制，登录限流 JSON 429 和不同访客配额隔离。Moye 代理位置在隔离夹具中保持可用。

根域名契约测试使用无主机端口映射、未接入生产网络的独立容器和空测试数据库，运行时设置正式来源以检查 Cookie 与同源校验；备案号使用测试夹具，仅在隔离容器出现。它不是对正式域名 HTTPS 或浏览器的验证。

收尾检查：候选镜像与服务器当前 Compose 通过激活兼容性校验；测试容器已停止并移除。生产镜像仍为原版本且 healthy，旧路径健康接口返回 `{"ok":true}`；Nginx SHA256 仍为 `b7c6f9911c0f4b0704a4572bca35bf3f3501cb7a615873a44f22782ef15da73c`，与准备前一致。Moye IP 根入口仍返回原有的 HTTP 404。

## DNS 只读核对

从 ECS 向 `223.5.5.5` 与 `119.29.29.29` 查询，结果一致：

- NS：`dns11.hichina.com`、`dns12.hichina.com`。
- 根域 A、AAAA、MX、TXT、CAA：查询返回 ENODATA。
- `cf zones list --name gua4u.cn` 返回空列表，当前账户中尚无该 zone；没有创建或购买资源。

这些结果只能说明本次查询的根域记录，**不能证明所有子域没有记录**。阿里云全部记录导出、注册商 DS/DNSSEC 状态仍待核对；不能将本地全局代理的假 IP 当成真实解析。

## 尚未验收

- 真实备案号及阿里云接入状态、阿里云完整 DNS 清单与 DNSSEC。
- 正式域名 DNS-only、受信任证书签发、Certbot 真实续期 dry-run 和定时器运行。
- Cloudflare 代理、Full (strict) 实际回源、Free Managed Ruleset、边缘静态缓存 HIT。
- 正式域名切换后的生产登录/图片/种瓜/牌局、旧入口跳转及外部绕源检查。
- 桌面/手机浏览器、键盘操作与视觉效果；用户的全局代理影响浏览器访问，本轮未要求关闭代理。
- 两个大陆网络的直连/代理成功率及 P95；没有性能通过或提速结论。

## 备份与回退

本轮未激活，因而没有新建“切换前数据备份”。已有最近一次部署备份为 `/opt/melon/backups/melon-data-20261023T084331Z.tar.gz`，环境版本备份 `/opt/melon/backups/env-before-20261023T084331Z`；不能把它们当成未来切换前的最新备份。

未来 `activate.py` 在确认无进行中对局后调用 `/opt/melon/backup-ecs.sh` 创建当时的数据快照，并将 Nginx、Compose、环境文件保存到 `/opt/melon/backups/cloudflare-<时间>/`；输出并记录实际路径。失败时恢复整套配置、镜像和 `/melon`，不覆盖用户数据库。Nginx 文件原地写入，保留 inode。

代理回退需先激活 direct 配置解除来源限制，再关闭 Cloudflare 代理；应用路径回退按激活快照逆序恢复，保持当前数据。详细命令与上线条件见 [接入操作手册](README.md)。
