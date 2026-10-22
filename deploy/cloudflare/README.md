# 🍉 Cloudflare 接入包

状态：**配置和验证工具已准备，未接通 Cloudflare。** 用户尚未购买域名；没有创建域名、DNS 记录或付费资源，没有切换服务器来源配置。当前生产入口仍是 `https://114.215.182.66/melon/`。

## 前置输入与边界

- 实际购买的域名，论坛固定使用其 `bbs` 子域名，路径保留 `/melon`。
- 向阿里云确认杭州 ECS 上论坛业务的域名接入及备案条件。
- 证书通知邮箱。签发脚本使用 Let's Encrypt/Certbot 标准 ACME 流程及服务条款。
- 两个真实大陆网络，用于直连/代理对比。网络标签由测试人员填写，工具不会把同一台机器的两次运行当成两个真实网络的证明。

保留现有应用镜像、SQLite、图片、Moye 和 SSH。使用 Cloudflare Free；不部署 Workers、D1、R2 或 Tunnel，不购买服务。域名变化需要重新登录，不迁移旧 IP 的 Cookie。

本地需 Python 3、Node 24 和已授权的 `cf`；ECS 脚本兼容现有 Python 3.6、curl、Docker。当前 cf 0.15.0 的 `cf cli search` 尚不可用，接入脚本使用已由 `--help`、`cf schema` 和 `--dry-run` 验证的命令。

## 文件与安全行为

- `render.py`：从当前 Nginx 配置生成 `acme`、`direct` 或 `proxied` 配置包，实时读取官方 IPv4/IPv6 来源网段。没有远端写操作。
- `activate.py`：在 ECS 应用配置。先检查实际域名、24 小时有效期、来源网段、原文件哈希及证书，再备份并运行 `nginx -t`；失败自动恢复文件、Compose 和 Nginx。保留文件 inode，兼容现有单文件 bind mount。
- `configure.py`：通过现有 `cf` OAuth 进行 DNS、TLS、缓存配置。默认只读与 dry-run，`--apply` 才会写；保存变更前快照，拒绝冲突 DNS、歧义规则及超出免费缓存规则数量。仅替换两个 `melon_*` 缓存规则，保留其他规则顺序。
- `certificate.sh` 和 systemd 模板：签发、续期域名证书。与 Moye 的 IP 证书续期分别运行，不停 Nginx。
- `verify.mjs`：公网冒烟检查、测速采样与两网络对比。不会打印密码；可通过本地私密凭据文件检查管理员登录，最后退出。

生成的包包含 Nginx、DNS 和缓存规则 JSON、TLS 设置及哈希清单。`bbs.example.com` 只能用于示例，激活器明确拒绝它。运行文件放 `.sites-runtime/cloudflare/`，凭据和备份不提交 Git。

## 实施顺序（域名到位后）

以下 `HOST`、`ZONE` 必须填写实际值。由执行接入的工程师操作，不要求站长手动执行这些命令。

### 1. 添加域名、准备源站证书

将新域名加入当前 Cloudflare 账户的免费计划，在注册商完成 Nameserver 设置，等待 zone 为 `active`。先完整核对 DNS 和 DNSSEC 状态，不直接覆盖其他用途记录。

在本机对 DNS 创建执行预览，再应用：

```sh
python3 deploy/cloudflare/configure.py --host "$HOST" --zone "$ZONE" --action dns-direct --snapshot-dir .sites-runtime/cloudflare/account
# 检查预览后，使用相同命令添加 --apply
```

复制本目录到 ECS `/opt/melon/cloudflare/`。在 ECS 根据**当时的**配置生成 ACME 包；每阶段都使用新输出目录：

```sh
cd /opt/melon/cloudflare
sudo python3 render.py --host "$HOST" --mode acme --base-nginx /opt/moye/deploy/nginx.conf --output /opt/melon/cloudflare-acme
sudo python3 activate.py --bundle /opt/melon/cloudflare-acme
sudo sh certificate.sh issue "$HOST" "$ACME_EMAIL"
```

ACME 阶段仅增加该域名的 HTTP 验证入口，旧论坛入口保持原状。证书在现有证书卷 `/opt/moye/deploy/letsencrypt/live/<HOST>/` 中，与 IP 证书隔离。

安装续期任务：

```sh
sudo cp melon-certificate@.service melon-certificate@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now "melon-certificate@$HOST.timer"
```

证书签发后运行 Certbot `renew --cert-name "$HOST" --dry-run` 验证挑战与续期；查看 timer 的下次执行时间。HTTP 与 HTTPS 都保留 ACME challenge 路径，兼容边缘 HTTP→HTTPS 跳转。

### 2. 域名直连验证

重新读取 Nginx 并生成 `direct` 包：

```sh
sudo python3 render.py --host "$HOST" --mode direct --base-nginx /opt/moye/deploy/nginx.conf --output /opt/melon/cloudflare-direct
sudo python3 activate.py --bundle /opt/melon/cloudflare-direct
```

该步骤将 Compose 中来源变量参数化，并在 `/opt/melon/.env` 写入正式 HTTPS 来源。旧 IP 的 `/melon` GET/HEAD 返回 **302 + no-store**，保留路径和查询参数；写请求返回 JSON 410。302 便于回退，不提前留下永久跳转缓存。

在本机执行：

```sh
node deploy/cloudflare/verify.mjs smoke --host "$HOST" --mode direct --credential-file outputs/melon-server-admin.txt
```

通过浏览器使用两个临时账户完整验证注册、图文发帖、回复、点赞、普通用户访问管理接口被拒绝、作者编辑权限，以及隐藏帖子后游客无法读取其图片。测试数据由实施人员记录并清理；不在生产执行会直接操纵本地数据库的旧 `test:integration` 脚本。记录 Moye 的原有响应作为对照。

### 3. 缓存、防护及代理

```sh
python3 deploy/cloudflare/configure.py --host "$HOST" --zone "$ZONE" --action edge --snapshot-dir .sites-runtime/cloudflare/account
# 审查后添加 --apply；此操作包含 zone 级 TLS/HTTPS/Rocket Loader 设置。
python3 deploy/cloudflare/configure.py --host "$HOST" --zone "$ZONE" --action proxy-on --snapshot-dir .sites-runtime/cloudflare/account
# 确认边缘证书已 active、直连及测速基线通过后，添加 --apply。
```

`edge` 配置 Full (strict)、Always Use HTTPS、关闭 Rocket Loader。Free Managed Ruleset 使用免费套餐自动启用的规则，在控制台核实安全事件；不创建付费托管规则，也不开启整站 JS 挑战。

缓存规则仅针对论坛 hostname，追加在原有规则后：

| 路径/响应 | 策略 |
| --- | --- |
| `/melon/_next/static/` 下 GET/HEAD 的 JS/CSS | 遵守源站缓存头；源站只对成功响应设置 immutable |
| HTML、API、用户图片、其他路径 | bypass，源站 `private, no-store` |
| 404、429 和其他错误 | no-store |

免费套餐的 Origin Cache Control 默认开启，不提交 Enterprise-only 开关。上传图片始终经过应用可见性校验。

DNS 确认已代理且域名访问正常后，在 ECS 重新生成并激活 `proxied` 包：

```sh
sudo python3 render.py --host "$HOST" --mode proxied --base-nginx /opt/moye/deploy/nginx.conf --output /opt/melon/cloudflare-proxied
sudo python3 activate.py --bundle /opt/melon/cloudflare-proxied
```

仅论坛 HTTPS 虚拟主机限制 Cloudflare 来源。限制依据 `$realip_remote_addr`（TCP 连接对端），绝不按可伪造的请求头放行；只有官方来源网段能设置真实访客 IP。登录、注册按访客 IP 限制 10 次/分钟、burst 10，返回 JSON 429 和 `Retry-After: 60`，不会限制普通阅读请求。

定期核对 Cloudflare 官方来源网段，变化时从当前配置重新生成、检查并应用 proxied 包。本包没有创建后台自动更新任务。

### 4. 公网验收

```sh
node deploy/cloudflare/verify.mjs smoke --host "$HOST" --mode proxied --credential-file outputs/melon-server-admin.txt --check-rate-limit
```

冒烟检查覆盖资源缓存 HIT、动态响应不命中、Secure/HttpOnly Cookie、旧入口、绕过 Cloudflare 的直接访问和伪造 IP，以及限流 JSON。它不替代两账户功能检查、实际上传图片隐藏检查、证书续期演练及浏览器视觉验收。

最后重启论坛容器核对账户、帖子、图片，检查 Moye 原有响应、服务健康及 Nginx 日志里的 peer/client 区分。不修改服务器整个 443 端口的安全组规则；Moye 仍对公网开放，因此不能声称整台服务器隐藏了 IP 或免受直打攻击。

## 大陆性能验收

在两个**实际不同的大陆网络**分别采样，直连和代理测试应在相近时段（工具要求相差不超过 2 小时）完成，建议包含晚高峰。首次采样在 direct 阶段，之后在 proxied 阶段：

```sh
node deploy/cloudflare/verify.mjs sample --host "$HOST" --mode direct --network hangzhou-mobile --confirm-mainland --output direct-mobile.json
node deploy/cloudflare/verify.mjs sample --host "$HOST" --mode proxied --network hangzhou-mobile --confirm-mainland --output proxied-mobile.json
# 在另一个真实网络执行同样流程，使用另一个 network 标签。
node deploy/cloudflare/verify.mjs compare direct-mobile.json proxied-mobile.json direct-telecom.json proxied-telecom.json
```

每组默认 100 次动态帖子列表请求，记录 HTTP 状态、总响应耗时与 CF-Ray。只有两组网络均满足成功率 ≥99%、代理 P95 ≤直连 P95×1.3 才返回通过；核心功能另外验收。没有真实数据就标记“未验收”。大陆经全球网络可能增加延迟，不能预先承诺加速。

## 回退

**仅退回域名直连：** 使用当前 Nginx 重新生成新的 direct 包并激活（先允许直连），再通过 `configure.py --action proxy-off` 预览并应用。浏览器信任的源站证书继续有效；Cloudflare 防护此时不生效。不要先关代理而保留源站白名单，否则会造成 403。

**恢复旧应用入口：** 先安排 DNS 退回直连，再使用首次域名切换前的备份：

```sh
sudo python3 /opt/melon/cloudflare/activate.py --restore /opt/melon/backups/cloudflare-实际时间
```

恢复器只允许恢复当前文件仍与该次激活结果一致的快照；如果中间又做了其他改动，会停止并要求合并差异，避免覆盖 Moye 后续配置。多阶段切换可按快照逆序回退。配置失败自动恢复，无数据库结构迁移；数据备份位于 `/opt/melon/backups/`。恢复旧 IP 后删除论坛 hostname 的 DNS 或明确返回维护页，避免留下错误入口。证书 timer 如不再需要可单独停用，不操作 Moye 的 timer。

## 本地与隔离测试

```sh
python3 -m unittest discover -s deploy/cloudflare -p 'test_*.py' -v
node --test deploy/cloudflare/test-verify.mjs
# ECS：在本目录运行；仅使用临时网络、模拟后端及测试证书，无 host ports。
sudo sh test-proxy.sh
```

测试中的自签名证书仅用于隔离夹具，生产脚本始终验证 HTTPS 证书。测试退出自动清理专属容器、网络和临时证书。

参考：[严格回源加密](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)、[缓存规则 API](https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/)、[来源网段](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)、[大陆访问说明](https://developers.cloudflare.com/support/troubleshooting/general-troubleshooting/geographic-traffic-routing/)。
