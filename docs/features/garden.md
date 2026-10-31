# 种瓜 · 每日签到

本页描述个人瓜田。公开合作玩法见 [社区合种瓜田](cooperative-garden.md)，两种玩法的每日资格和收获记录独立。

入口 `/melon/garden/`（不配置 basePath 时为 `/garden/`）。首页签到卡、桌面侧栏及手机展开导航均可进入。已有账户直接使用；游客点击签到会打开登录弹窗。

每天北京时间 00:00 重置签到资格。累计签到七次依次播种、发芽、长藤、开花、结瓜、长大、成熟；第七次自动收获一颗西瓜，当天保留成熟画面，下次签到从播种开始。漏签不会损失成长或收获，连续签到天数在漏过一个完整日期后归零。不设补签、兑换、排名或牌室奖励。收获历史仅本人可见，每页 20 条。

## 数据和接口

迁移 `drizzle/0002_narrow_blob.sql` 仅增加 `garden_check_ins`，复合主键 `(user_id, day)` 从数据库层面保证每天一次。服务器记录北京时间日期和毫秒时间；累计天数、成长、连续天数及每第七次签到的收获记录由这些记录推导，不维护可能重复增长的奖励余额。ECS 启动时自动应用新增迁移，Vinext 本地使用原有 `npm run db:migrate`。

- `GET /api/garden?page=1`：会话所有者的状态、北京时间日期、下一次重置时间、分页收获历史。
- `POST /api/garden/check-in`，JSON `{}`：签到，返回最新状态及 `alreadyCheckedIn`、`harvested`。重复提交成功返回当前状态，不重复发放。不接受客户端指定日期、账户或奖励。
- 两个接口要求有效登录，均为 `Cache-Control: no-store`。写入沿用同源校验，非法输入为 400、未登录/会话过期为 401、跨站写入为 403。不存在子路径为 404。
- 页面在刷新、重新获得焦点、恢复可见和北京时间零点重新读取状态；账户切换清除个人界面状态。客户端不提前增加进度，网络不确定时可以安全重试。

## 验证

```sh
npm run typecheck
npm run test:garden
NEXT_PUBLIC_BASE_PATH=/melon npm run build:ecs
```

接口测试仅允许回环 URL 和名称包含 `garden-qa` 的隔离数据目录，不能针对生产数据运行：

```sh
export MELON_DATA_DIR="$PWD/.sites-runtime/garden-qa"
export MELON_TEST_URL=http://127.0.0.1:5173/melon
node scripts/init-ecs.mjs
# 在另一个终端以相同 MELON_DATA_DIR 启动已构建服务：
# NEXT_PUBLIC_BASE_PATH=/melon MELON_PUBLIC_ORIGIN=http://127.0.0.1:5173 npm run start:ecs -- --hostname 127.0.0.1 --port 5173
HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= NO_PROXY=127.0.0.1,localhost npm run test:garden-api
# 停止并重新启动该服务后：
HTTP_PROXY= HTTPS_PROXY= ALL_PROXY= NO_PROXY=127.0.0.1,localhost npm run test:garden-api -- --after-restart
```

第一阶段保留两个测试账户及私密检查点用于真实重启验证；第二阶段清理所有测试签到、账户和会话。发生失败时清理本次测试账户。测试期间避免跨过北京时间零点；日期边界由可控时间的模型测试覆盖。

在全局代理环境下不依赖浏览器访问；接口和服务器检查不代表桌面/手机视觉、键盘操作、动画或外部网络访问验收。具体执行结果见 [验证记录](../verification/history.md)。

## 发布与回退

发布前备份数据和镜像配置，确认没有进行中的牌局，再使用 `deploy/update-image.sh` 切换已验证的镜像。新增表与旧镜像兼容；回退只切换回旧镜像，保留签到表及新增用户内容，不用旧数据库覆盖生产。沿用原 SQLite/图片目录与备份方式，无新增云资源。
