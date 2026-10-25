# 🍉 · 好瓜，一起聊

一个中文热点 BBS。支持真实账户、Markdown 图文发帖、回复引用、点赞、搜索与分页、热榜、精选及基础管理。保留本地 Vinext 预览，同时提供 ECS 生产部署。

## 线上访问

已部署至 [🍉 社区](https://114.215.182.66/melon/)，与原有 Moye 网站共用 HTTPS 入口。按要求仅初始化四个分区及管理员，未导入演示内容。

管理员用户名为 `melon_admin`，随机初始密码通过本机 `outputs/melon-server-admin.txt` 私密文件交付。ECS 使用 Node 24、Next.js standalone、SQLite 和磁盘图片存储，数据位于 `/opt/melon/data`。部署、重启、备份及更新步骤见 [ECS 维护说明](deploy/README.md)。本地与服务器数据各自独立。

Cloudflare 接入工具已准备，详见 [接入包与验收步骤](deploy/cloudflare/README.md)。已购买根域名 `gua4u.cn`，备案仍在进行；根路径候选版本已准备，尚未切换 DNS、证书或生产入口。详见 [域名接入验收记录](deploy/cloudflare/VERIFICATION-ROOT.md)。

## 启动

要求 Node.js 22.13+（本次使用 24），首次安装需要联网下载依赖。

```sh
npm ci --cache .sites-runtime/npm-cache
npm run db:generate  # 仅在修改 schema 后需要；仓库已包含首版迁移
npm run build
npm run db:migrate
npm run db:seed
npm run dev -- --hostname 127.0.0.1
```

开发服务默认 http://127.0.0.1:5173，以终端打印地址为准。安装命令使用项目内缓存，以避开此机器系统 npm 缓存中的权限问题。`npm run build && npm start` 启动构建后本地预览，通常为 http://127.0.0.1:8787。本次交付预览使用 `npm start -- --port 5173`。两个模式共享 `.wrangler/state` 中的本地 D1/SQLite 和 R2 数据。应用使用自己的用户名/密码账户，不使用模板的 ChatGPT 模拟登录。

## 使用与管理

网页右上角注册：用户名 3–24 位英文字母、数字或下划线；昵称 2–20 字；密码 8–128 字符。游客可阅读，登录后可发帖、回复和点赞。

先注册，再在本地终端授予管理员权限：

```sh
npm run admin -- your_username
```

刷新后左侧出现「社区管理」。可精选、置顶（最多 3 条）、隐藏和恢复帖子及回复。本地没有预设管理员密码，也没有开放的管理员注册接口。示例用户不能登录；ECS 管理员由容器初始化命令创建。

支持常用 Markdown：标题、粗体、斜体、列表、引用、代码、HTTP/HTTPS 链接。原始 HTML 仅按文字显示。每帖最多 9 张 JPEG、PNG 或 WebP 图片，单张不超过 5 MB。图片保存在当前运行环境的数据目录，不使用外部图床。

热门分数为近 7 天点赞数 + 2 × 有效回复数；非作者回复按「用户、帖子、上海日期」去重，隐藏回复不计分。热榜按分数和帖子发布时间排序；列表优先显示置顶，人工精选另设入口。

## 数据与备份

- 数据模型：`db/schema.ts`；SQL 迁移：`drizzle/`。
- `npm run db:migrate` 只应用尚未登记的本地迁移。新增 schema 后生成新迁移，勿修改已应用文件。
- `npm run db:seed` 可重复执行，不覆盖已有帖子。演示内容带有虚构标识，配图为原创程序绘制插画。
- 数据与图片都在 `.wrangler/state/`，不加入 Git。请在停止所有开发/预览服务后完整复制该目录备份，恢复时原位替换。只备份源码不包含用户数据。
- `.sites-runtime/` 保存临时运行文件。不要把 `.wrangler/`、环境变量、密码或备份提交到 Git。
- `npm run dev` 与 `npm start` 默认仅监听回环地址。ECS 使用单独的生产容器，未注册 Sites 云站点。

## 验证

```sh
npm run typecheck
npm run build
# 先启动本地服务，再执行；可指定 MELON_TEST_URL
npm run test:integration
```

集成测试通过本地 API 创建两个临时账户，检查账户、发帖、图片、引用、点赞、输入错误、越权、管理及分页；测试结束清理专用测试数据。它会在测试账户上临时授予管理权限，不改变其他账户角色。浏览器验证结果见 `VERIFICATION.md`。

首版不包含私信、匿名、关注、通知、外部热榜、密码找回或完整举报审核。ECS 已启用 HTTPS、容器重启策略与手动备份脚本；尚未配置定时备份。

## 实现说明

页面间使用标准站内链接和整页导航；点赞、回复及管理操作仍异步更新。此选择避开当前 Vinext beta 模板在正式构建中出现的 RSC 预取兼容问题，已在构建预览验证。数据库、API 和用户会话不依赖该预取机制。

## 牌室

导航新增“牌室”：真人斗地主与完整升级掼蛋，支持邀请朋友、准备开局、贡还牌、断线重进和超时处理。详见 [牌室使用与规则说明](CARD_ROOM.md)。新增迁移仅增加房间表；ECS 启动自动迁移，本地 Worker 模式运行 `npm run db:migrate`。

## 种瓜

每日签到让瓜苗成长，累计七天自动收获一颗西瓜。漏签保留进度，收获记录仅本人可见。入口 `/melon/garden/`，首页和导航也可进入。沿用现有账户，无积分兑换或牌室奖励。

迁移 `0002_narrow_blob` 只新增签到表；ECS 启动自动应用，本地 Worker 模式运行 `npm run db:migrate`。执行 `npm run test:garden` 检查成长与日期规则；隔离接口及真实重启测试步骤见 [种瓜说明](GARDEN.md)。
