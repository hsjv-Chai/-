# 牌室模块

- `cards.ts`：实体牌、牌型、百搭与比较规则，前后端可共同使用的纯逻辑。
- `engine.ts`：房间状态、回合推进、贡还牌、升级、超时和公开视图；不访问存储。
- `api.ts`：登录与房间权限、版本并发控制、持久化和单房间占座约束，仅服务端使用。
- `components/card-room.tsx`：大厅、轮询、选牌与牌桌交互。

调用链为 UI → 统一 API 入口 → 牌室 API → 引擎/牌型与共享存储。客户端只能使用纯规则和公开状态类型，不导入 API 或存储。必须保留进行中手牌隔离、正常结算亮牌、请求版本检查与跨房占座约束。

规则与接口测试分别位于 `tests/unit/test-games.mts`、`tests/integration/test-games-api.mts`、`tests/integration/test-single-room-api.mts`。对局使用随机发牌，因此完整对局的断言次数可能不同。

玩法见 [牌室说明](../../docs/features/card-room.md)，执行方法见 [开发指南](../../docs/development.md)。
