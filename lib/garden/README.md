# 种瓜模块

- `model.ts`：北京时间日期、成长阶段、连续签到与收获计算，供前后端共用的纯函数。
- `api.ts`：本人状态、分页收获记录与幂等签到，仅服务端使用。
- `components/garden.tsx`：瓜苗展示、签到交互、跨日更新与收获列表。
- `cooperative-model.ts`：合种常量、公开类型、成长阶段与北京时间时钟。
- `cooperative-queries.ts`：Node/D1 共用条件写入；`cooperative-api.ts`：大厅、详情、本人纪念及参与操作。
- [瓜田前端](../../components/garden/README.md)：共享插画与合种界面，原个人签到契约不变。

API 通过统一入口获得同源保护，使用共享会话与存储。日期由服务端决定，唯一约束防止并发或重试重复签到；客户端不能指定日期或奖励。公开状态类型可用于 UI，数据库及会话实现不能进入客户端依赖。

测试位于 `tests/unit/test-garden.mts` 和 `tests/integration/test-garden-api.mts`。后者分为首次检查与实际重启后的 `--after-restart` 检查，必须复用同一隔离数据目录。

玩法见 [种瓜说明](../../docs/features/garden.md)，启动和测试命令见 [开发指南](../../docs/development.md)。

合种的容量、每日资格、结算及管理权交接由 `0006_cooperative_garden` 的约束和触发器保证。SQLite 多连接竞争、HTTP 接口及 Wrangler 本地 D1 分别验证业务和存储兼容性。见 [合种玩法与开发说明](../../docs/features/cooperative-garden.md)。
