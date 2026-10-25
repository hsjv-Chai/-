# 🍉 根域名接入包

目标为 **https://gua4u.cn/**，牌室 `/games`、种瓜 `/garden`。已购买域名，但备案仍在进行。本次只准备代码、候选镜像和隔离测试；生产仍是 `https://114.215.182.66/melon/`，没有切换 DNS、签发域名证书或激活域名虚拟主机。实际结果见 [验收记录](VERIFICATION-ROOT.md)。

使用 Cloudflare Free 代理及 ECS HTTPS 回源，保留 SQLite、图片、账户、Moye 和 SSH，不购买产品，不部署 Workers/D1/R2/Tunnel。正式域名启用后需重新登录，Cookie 使用 `/`、Secure、HttpOnly、SameSite=Lax。

## 上线条件与私密配置

必须先取得真实备案号、确认阿里云接入完成，再实施以下正式操作。不要因为 DNS 可以解析就判定备案通过。参见 [阿里云备案期间访问要求](https://help.aliyun.com/zh/icp-filing/the-influence-of-the-record-during-the-site-visit)。

私密 readiness JSON 放在本机 `.sites-runtime/domain/gua4u.cn-readiness.json`，上线时安全复制到 ECS `/opt/melon/domain-readiness.json`，权限 600，禁止提交 Git。包含：

```json
{
  "host": "gua4u.cn",
  "icp_approved": false,
  "aliyun_access_confirmed": false,
  "icp_number": "",
  "certificate_email": ""
}
```

本机文件已填入用户提供的联系邮箱，并保留两个 `false`。仅在实际满足条件后填写真实备案号并改为 `true`。`activate.py`、`configure.py --apply`、证书签发均检查此文件；缺失、权限过宽或未获批准会拒绝操作。邮箱只用于运行配置，页脚只展示已确认的备案号并链接 `https://beian.miit.gov.cn/`。

## DNS 清单与迁移

公开查询无法枚举所有子域记录。迁移前必须从阿里云导出**全部记录**，记录 TTL、代理状态、邮箱 MX、SPF/DKIM/DMARC、验证 TXT、CAA、子域及其他用途；逐条复核 Cloudflare 导入，不能只依赖自动扫描。再核对注册商的 DNSSEC/DS 和原 DNS 签名状态，按提供商流程先移除旧 DS、等待生效，再改 NS；Cloudflare 稳定后再启用 DNSSEC 并登记新 DS，避免验证失败。

| 项目 | 目标/处理 |
| --- | --- |
| zone | `gua4u.cn`，Free；本轮未创建 |
| 根域名 A（界面名 `@`，API 名 `gua4u.cn`） | `114.215.182.66`，先 DNS-only、TTL 300 |
| 根域名 AAAA/CNAME/HTTPS/SVCB | 若存在冲突先核实用途；脚本拒绝自动覆盖 |
| MX/TXT/CAA/其他子域 | 保留并逐项核对，不删除、不臆造 |
| nameservers | 使用未来 Cloudflare 分配的实际 NS，不使用示例值 |
| DNSSEC/注册商 DS | 尚未核实，必须从阿里云核对后再迁移 |
| `www` | 本次不新增；若已存在，保留原用途 |

备案及接入完成后，再加入 Cloudflare Free zone、迁移 NS，等待 zone active。使用已授权 `cf` CLI，脚本默认只读和 dry-run；先审阅再加 `--apply --readiness 私密文件`。根域名与 zone 名称相等合法，其他域名必须是该 zone 的子域；拒绝相似但无关的域名。

```sh
HOST=gua4u.cn
ZONE=实际的zone-id
python3 deploy/cloudflare/configure.py --host "$HOST" --zone "$ZONE" --action dns-direct --snapshot-dir .sites-runtime/cloudflare/account
# 核对 DNS 全清单、DNSSEC、免费套餐及预览后，才在同一命令追加：
# --apply --readiness .sites-runtime/domain/gua4u.cn-readiness.json
```

脚本只处理指定主机的 A 记录，保存变更前快照（600），保留其他记录；不会帮你购买域名或自动迁移 NS。`edge` 会更改 zone 级 TLS/HTTPS/Rocket Loader 设置，执行前也要核对其他子域的兼容性。

## 镜像与切换准备

本机使用 Python 3、Node 24、已登录的 `cf`；ECS 使用 Python 3.6+、Docker、curl。从完整且不含私密文件的源码构建：

```sh
sudo docker build --network host --build-arg BASE_PATH= -f deploy/Dockerfile -t melon-community:根路径版本 .
```

镜像必须同时有空 `NEXT_PUBLIC_BASE_PATH` 和 `io.melon.base-path` 标签。Compose 的 `${MELON_BASE_PATH-/melon}` 使用单个减号：未设时兼容旧站，显式空值才是根路径。健康检查从运行时 base path 生成 `/api/health`。不要用普通 `update-image.sh` 跨路径切换，它会拒绝镜像与当前路径不一致。

将本目录复制到 `/opt/melon/cloudflare/`，备份脚本保持 `/opt/melon/backup-ecs.sh`。以下操作仅在备案、阿里云接入及 DNS 清单核对完成后执行。每次生成新目录；包超过 24 小时、来源网段或线上 Nginx 改变，都必须重新生成并审阅。

## 证书与域名直连

在 ECS 中设置：

```sh
HOST=gua4u.cn
READY=/opt/melon/domain-readiness.json
IMAGE=melon-community:已测试的根路径版本
cd /opt/melon/cloudflare
sudo python3 render.py --host "$HOST" --mode acme --base-nginx /opt/moye/deploy/nginx.conf --output /opt/melon/cloudflare-acme-实际时间
sudo python3 activate.py --bundle /opt/melon/cloudflare-acme-实际时间 --readiness "$READY"
sudo sh certificate.sh issue "$HOST" "$READY"
sudo sh certificate.sh verify-renewal "$HOST"
```

ACME 阶段只增加域名 HTTP challenge 虚拟主机，论坛仍在旧 IP。证书为浏览器信任的 Let's Encrypt 证书，存储在现有卷 `live/gua4u.cn/`，与 Moye/IP 证书隔离。`verify-renewal` 使用 Certbot staging `--dry-run`，通过后安装定时续期（每天两次检查）：

```sh
sudo cp melon-certificate@.service melon-certificate@.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now melon-certificate@gua4u.cn.timer
sudo systemctl list-timers melon-certificate@gua4u.cn.timer
```

随后按当前 Nginx 重新生成 direct 包：

```sh
sudo python3 render.py --host "$HOST" --mode direct --base-nginx /opt/moye/deploy/nginx.conf --output /opt/melon/cloudflare-direct-实际时间
sudo python3 activate.py --bundle /opt/melon/cloudflare-direct-实际时间 --image "$IMAGE" --readiness "$READY"
```

激活器检查备案文件、镜像路径、证书、配置哈希及无进行中的牌局，备份数据与 Nginx/Compose/.env；同时切换镜像、空 `MELON_BASE_PATH`、`MELON_PUBLIC_ORIGIN=https://gua4u.cn` 和真实备案号。写 Nginx 时保留 inode，兼容单文件挂载。发生失败时整体恢复原文件与容器配置，不恢复旧数据库覆盖新数据。正式操作需安排短暂维护时段，避免检查后又开启牌局。

新域名及旧 IP HTTPS 的 `/melon`、`/melon/...` GET/HEAD 使用 302 + no-store 跳至根路径，保留原始转义路径和查询参数；POST/PUT/PATCH/DELETE 返回 JSON 410。旧 IP HTTP 仍先沿用原有 HTTPS 跳转。`/melonade` 等不同路径不匹配。Moye 的 IP 根路径及 SSH 保持原状。

## Cloudflare、防护与缓存

先完成域名 DNS-only 的 HTTPS 和完整功能检查，再执行 `edge` 预览/应用，确认边缘证书 active 后执行 `proxy-on` 预览/应用。命令结构与 `dns-direct` 相同，替换 `--action`。所有写入仍需 readiness 文件。

- Full (strict)、Always Use HTTPS、Rocket Loader off；核对免费 Free Managed Ruleset 和安全事件，不添加付费托管规则。
- 仅允许 `/_next/static/` 下 GET/HEAD 的 JS/CSS 缓存，遵循源站缓存头。Nginx 只对 200/304 设置一年 immutable。
- HTML、所有 API、搜索、登录、种瓜、牌局状态、图片和错误均不缓存；图片仍需应用检查可见性。其他路径在 Cloudflare bypass，源站 private/no-store。
- `/api/auth/login` 与 `/api/auth/register` 的 POST 按真实访客 IP 限制 10 次/分钟、burst 10；JSON 429、no-store、Retry-After 60；保留应用按用户名限制。

确认代理可用后再生成并激活 `proxied` 包（同 direct 命令，替换模式及目录），仅论坛虚拟主机限制 Cloudflare 网段。判断连接来源使用 `$realip_remote_addr`；只信任官方网段送来的 `CF-Connecting-IP`。HTTP/HTTPS ACME challenge 保留。定期核对官方来源网段再重新生成配置，不修改整个服务器安全组，Moye 的公网入口保持可用。

Cloudflare 的来源白名单基于其共享出口网段，并不构成对“指定账户”的加密认证。本方案保留与 Moye 共用的公网 IP，不能承诺隐藏源站或防止全部直打。

## 验收

优先在 ECS 内以 `curl --noproxy '*'` 检查源站及 Nginx，并通过独立解析器核对 DNS；外部直连/代理效果须单独测量。

```sh
node deploy/cloudflare/verify.mjs smoke --host gua4u.cn --mode direct --credential-file 私密管理员文件
node deploy/cloudflare/verify.mjs smoke --host gua4u.cn --mode proxied --credential-file 私密管理员文件 --check-rate-limit
```

必须另外完成临时账户的发帖、图片、种瓜、牌局邀请/操作、权限隔离和隐藏图片访问检查。隔离测试脚本会直接操作测试数据库，禁止对生产运行。上线后的数据备份和配置备份记录实际路径；验证容器重启及 Moye 状态。

两个真实大陆网络分别在 direct/proxied 阶段采样，时间相差不超过两小时，默认每组 100 个动态请求：

```sh
node deploy/cloudflare/verify.mjs sample --host gua4u.cn --mode direct --network hangzhou-mobile --confirm-mainland --output direct-mobile.json
node deploy/cloudflare/verify.mjs sample --host gua4u.cn --mode proxied --network hangzhou-mobile --confirm-mainland --output proxied-mobile.json
# 在另一实际大陆网络同样采样。
node deploy/cloudflare/verify.mjs compare direct-mobile.json proxied-mobile.json direct-telecom.json proxied-telecom.json
```

验收线：每个网络成功率至少 99%，代理 P95 不超过直连 1.3 倍，核心操作无新增失败。不能把同一台机器改两个标签当成两个网络，也不能把 ECS 内访问当成公网体验。没有实测数据不宣称提速或性能通过。

## 回退

**退回同域名直连：** 从当前配置生成并激活 direct 包，先解除论坛 Cloudflare 来源限制；再 `configure.py --action proxy-off` 预览并应用。源站有效证书保留，Cloudflare 边缘防护不再生效。不能先关闭代理而保留来源限制。

**恢复旧镜像及 `/melon`：** 使用首次 direct 激活前的协调快照。若之后又激活了 proxied，先按相反顺序恢复配置快照；脚本要求当前文件哈希仍与该次应用结果一致，避免覆盖后来改动：

```sh
sudo python3 /opt/melon/cloudflare/activate.py --restore /opt/melon/backups/cloudflare-实际时间
```

恢复镜像版本、Compose、来源、路径及 Nginx，不覆盖用户数据库。若快照哈希不匹配，先人工审查差异。恢复旧入口后为域名配置维护页或移除论坛解析，避免留下错误入口。证书 timer 可单独停用，不能影响 Moye 的 timer。

## 可重复的隔离测试

```sh
python3 -m unittest discover -s deploy/cloudflare -p 'test_*.py'
node --test deploy/cloudflare/test-verify.mjs
# ECS：只使用专属临时 Docker 网络、模拟后端、自签名测试证书，不映射主机端口。
cd deploy/cloudflare && sudo sh test-proxy.sh
```

应用根路径还可在独立 Node 数据目录运行 `scripts/test-root-domain.mjs`。要求 loopback URL、目录名包含 `root-domain-qa`，服务器配置 HTTPS 正式来源；测试检查根 Cookie、同源保护、静态资源和运行时备案页脚。它不验证真实公网 TLS。自签名证书、示例域名和测试备案号只用于隔离夹具，生产脚本拒绝示例域名。

参考：[严格回源](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)、[缓存规则](https://developers.cloudflare.com/cache/how-to/cache-rules/create-api/)、[官方网段](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/)。
