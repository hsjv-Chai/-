# 社区服务端模块

唯一 HTTP 入口是 `app/api/[...path]/route.ts`。入口解析路径，对非 GET 请求执行同源校验，分发资源，并统一捕获异步错误。这里的函数不应由页面组件调用。

| 模块 | 资源与职责 |
| --- | --- |
| `auth.ts` | 登录、退出、当前账户及频次限制；邮箱验证与注册事务委托 `lib/email/` |
| `catalog.ts` | 分区与站点统计 |
| `posts.ts` | 帖子列表/详情/编辑、回复、点赞与图片关联 |
| `queries.ts` | 可见帖子、帖子统计与近七天热度查询 |
| `uploads.ts` | 上传校验、对象存储、读取可见性与私有缓存头 |
| `users.ts` | 公开个人资料与可见回复 |
| `admin.ts` | 精选、置顶和内容隐藏/恢复 |
| `accounts.ts` | 管理员账号查询、状态变更及审计；注册来源规范化在 `lib/registration-ip.ts` |

处理器返回 `Response`；不支持的操作返回 `undefined`，由入口生成原有 JSON 404。验证错误使用共享 `fail`，不要在模块中添加吞掉错误的 catch；入口必须 `await` 处理器，保证权限异常不会绕过统一错误响应。

通用会话、权限、输入验证、数据库调用及 JSON 响应在 `lib/server.ts`。存储始终通过 `@/lib/storage-runtime` 访问，Worker 构建会将这个精确入口替换为 Worker 绑定。不要在业务处理器里导入 `node-storage.mjs`。

`posts.ts` 的批量帖子/图片更新、点赞幂等、管理置顶上限及图片隐藏检查必须保持原子性和权限语义。账号状态由共享身份校验及数据库触发器共同保护，牌室通过绑定房间的临时权限完成整场对局。详见 [账号管理](../../docs/features/account-management.md)。

注册发信适配器、验证码生命周期及累计邮箱名额归属 [邮箱模块](../email/README.md)。公开个人资料必须显式选择展示字段，不能直接返回共享 `getUser` 中的本人邮箱信息。

验证入口：`npm run test:integration`、`npm run test:api-routing`。测试需使用独立存储；部署方法见 [开发指南](../../docs/development.md)。
