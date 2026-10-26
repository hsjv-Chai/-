# 开发与验证指南

所有命令从仓库根目录运行。需要 Node.js 22.13+，推荐 24；安装与现有依赖版本以 `package.json` 和锁文件为准。

## 找到修改位置

先看 [架构图与目录分工](architecture.md)。开发入口：[社区前端](../components/community/README.md)、[社区 API](../lib/community/README.md)、[牌室](../lib/games/README.md)、[种瓜](../lib/garden/README.md)。`beta/` 是只读参考快照，不参与当前构建。

保留前后端依赖边界，按业务拆文件；不要为了共享一个类型导入整个服务端模块。改动运行环境时必须验证 Worker 和 Node 两种构建。现有 npm 命令名称保持兼容；直接执行测试文件时使用新的 `tests/` 路径。

## Vinext 本地预览

```sh
npm ci --cache .sites-runtime/npm-cache
npm run build
npm run db:migrate
npm run db:seed
npm run dev -- --hostname 127.0.0.1
```

开发默认端口 5173；构建后预览用 `npm start`，默认 8787，以终端输出为准。两种方式共享 `.wrangler/state`。演示数据仅在显式运行 `db:seed` 后初始化，测试图片不依赖演示数据。

## Node 隔离接口环境

以下路径只用于自动化测试，不能指向真实站点数据。目录名同时满足牌室与种瓜脚本的隔离保护。

```sh
export MELON_STORAGE=node
export MELON_DATA_DIR="$PWD/.sites-runtime/card-room-qa-garden-qa-structure"
export MELON_PUBLIC_ORIGIN=http://127.0.0.1:5181
export MELON_TEST_URL=http://127.0.0.1:5181/melon
export NEXT_PUBLIC_BASE_PATH=/melon
node scripts/init-ecs.mjs
npm run build:ecs
npm run start:ecs -- --hostname 127.0.0.1 --port 5181
```

在另一个终端设置相同环境后运行接口测试。构建产物只能同时服务一种前缀；修改前缀前停止预览，重新构建再启动。standalone 镜像启动方式见部署文档，以上是本机测试入口。

```sh
npm run test:integration
npm run test:api-routing
npm run test:single-room
npm run test:games-api
npm run test:garden-api
# 实际停止并重启服务，仍使用同一个数据目录，然后执行：
npm run test:garden-api -- --after-restart
```

接口测试会创建临时账户、修改测试数据并清理。`test:integration` 的 SQL 操作使用所选存储，不提供生产环境保护，因此必须使用隔离目录；不要仅凭 URL 判断数据库是否安全。所有测试顺序执行，避免共享测试数据库时相互干扰。

种瓜首次接口检查保留重启检查点，第二阶段完成后清理。其他失败产生的测试数据留在隔离目录中排查，不能通过操作生产数据来修复测试。

## 根路径、HTTPS 来源与持久化

普通根路径回归：将 `NEXT_PUBLIC_BASE_PATH` 设为空，`MELON_TEST_URL` 去掉 `/melon`，重新构建与启动，执行上述接口测试。

根 Cookie 和 HTTPS 来源契约使用单独环境：数据目录名称包含 `root-domain-qa`，构建前缀为空，服务器 `MELON_PUBLIC_ORIGIN=https://example.com`，测试 URL 指向回环服务。运行 `npm run test:root-domain`，可通过 `MELON_TEST_ORIGIN` 指定其他测试来源。设置 `MELON_TEST_ICP_NUMBER` 时必须与服务器的测试备案号一致。示例域名和备案号只用于隔离夹具，不代表真实上线。

全量数据重启测试使用 `tests/integration/test-ecs-persistence.mjs prepare` / `verify`。配置独立的 `qa` 数据目录和回环 `MELON_TEST_URL`；服务使用 HTTPS 示例来源以便检查 Secure Cookie。`prepare` 后实际重启服务，再用相同环境运行 `verify`，验证并清理账户、帖子、回复、图片、点赞和会话。

## 必要检查

```sh
npm run test:games
npm run test:garden
npm run test:boundaries
npm run typecheck
npm run build
NEXT_PUBLIC_BASE_PATH=/melon npm run build:ecs
NEXT_PUBLIC_BASE_PATH= npm run build:ecs
```

Vinext 与 Next 会写入相同的路由类型缓存；切换后出现缓存型错误时，先用匹配前缀运行 `node node_modules/next/dist/bin/next typegen` 再类型检查，不能通过关闭类型检查解决。

模块边界测试检查客户端是否间接导入服务端存储，以及社区模块是否形成循环引用。Worker 构建还需检查服务端产物没有引入本项目的 Node 文件存储实现。

Cloudflare 工具测试保持在 `deploy/cloudflare/`，运行 Python 配置测试及 `test-verify.mjs`。其 Docker/Nginx 测试与实际域名接入不是本地应用回归的一部分。

## 访问与记录

回环请求可显式使用 `HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= NO_PROXY=127.0.0.1,localhost`。浏览器或外网无法访问时，只记录实际完成的接口和构建检查；不宣称桌面、手机、键盘或公网体验已验收。

历史结果见 [验证记录](verification/history.md)，本次整理结果见 [结构整理验收](verification/project-structure.md)。公开记录只使用示例地址，私密配置、账户和具体备份位置不提交 Git。
