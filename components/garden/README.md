# 瓜田前端

- `../garden.tsx` 保留个人签到和首页紧凑入口，接口不变。
- `plant.tsx` 是个人与合种共用的原有瓜苗 SVG，阶段由各自模型决定。
- `navigation.tsx` 提供经过 `appPath` 的个人／合种导航。
- `cooperative.tsx` 组合大厅、详情及交互，`cooperative-ui.tsx` 提供卡片、表单、分页、进度和纪念展示。
- `use-cooperative.ts` 负责公开与私人请求、可见时轮询、跨日刷新和响应顺序。

公共类型和成长计算来自 `lib/garden/cooperative-model.ts`；此目录不能导入存储或服务端模块。服务端独立校验权限、事务及容量，按钮禁用状态不构成授权。样式限定在 `app/cooperative-garden.css` 的瓜田类中。

见 [合种玩法与接口](../../docs/features/cooperative-garden.md) 和 [实际验证记录](../../docs/verification/cooperative-garden.md)。
