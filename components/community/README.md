# 社区前端模块

从 `index.tsx` 开始阅读。它管理路由、会话、刷新版本及消息提示，将展示交给子组件。页面入口通过 `@/components/community` 导入默认组件。

| 文件 | 职责 |
| --- | --- |
| `index.tsx` | 页面容器及社区、牌室、种瓜的装配 |
| `layout.tsx` | 页头、侧栏、手机底部导航、热榜与精选 |
| `welcome.tsx` | 首页介绍、手机分区卡片、快速发帖与种瓜入口 |
| `feed.tsx`、`post-row.tsx` | 筛选、分页、帖子列表及列表项 |
| `post-detail.tsx`、`lightbox.tsx` | 正文、回复、引用、点赞与图片查看 |
| `editor.tsx` | 新建/编辑、Markdown 预览、图片上传 |
| `auth-modal.tsx`、`profile.tsx`、`admin.tsx` | 账户弹窗、个人页、管理操作 |
| `use-auth-dialog.ts` | 登录注册弹窗的背景滚动锁定、可视窗口适配和关闭后的焦点恢复 |
| `accounts.tsx` | 管理员账号搜索、筛选、封禁确认及审计记录 |
| `client.ts`、`use-data.ts` | 社区 HTTP 请求及可取消结果更新的数据加载 Hook |
| `types.ts`、`display.tsx` | 页面展示类型、链接、头像和通用状态 |

依赖方向为容器 → 功能组件 → 请求/展示工具。子组件不导入容器，不建立循环依赖，不直接访问数据库或服务端身份验证模块。展示类型不应依赖数据库行类型。

`display.tsx` 的 Link 使用原生链接并通过 `appPath` 添加前缀；保留整页导航，以兼容 Vinext 的构建预览。不要直接换成框架预取链接。请求错误、表单值、刷新时机和 CSS 类名均属于现有交互约定。

API 实现在 [社区服务端](../../lib/community/README.md)，回归测试在 `tests/integration/test-integration.mjs` 和 `test-api-routing.mjs`。牌室和种瓜继续使用各自请求与状态管理；此模块仅向它们传入账户、登录入口和就绪状态。

社区工作区视觉样式在 `app/community.css`，基础排版、表单及详情样式在 `app/globals.css`。根布局依次加载基础样式与社区样式；牌室扑克/牌桌和种瓜插画继续使用各自样式模块。

登录注册弹窗仅由关闭按钮或 Esc 关闭；表单在 `.auth-modal-content` 内滚动，关闭按钮位于滚动区域外。不要给整个 `dialog` 添加点击关闭处理，否则点击内部空白或拖动结束可能丢失表单。滚动适配只作用于 `.auth-modal`，不改变账号管理确认框。验证记录见 [登录注册弹窗滚动修复](../../docs/verification/auth-dialog-scroll.md)。
