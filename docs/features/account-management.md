# 账号管理

管理员进入「社区管理 → 账号」，可搜索用户名或昵称、筛选状态及集中注册标记，每页 20 条。封禁和解封均填写原因并确认，操作记录包含操作者、时间和原因。网页不提供账号删除、密码重置或角色调整；不能管理自己及其他管理员的封禁状态。

## 注册来源与标记

同一规范化 IP 在滚动 10 分钟内成功注册至少 5 个账号时，保存本次触发事件及当时的账号名单。每次后续触发均留下独立记录；账号列表展示最近一次事件，可点击查看同批账号。标记持续保留，不限制注册，也不自动封禁。共用校园网、家庭网或代理出口可能正常触发。

历史账号的来源显示「未知」，不会从访问日志猜测补录。未知或非法 IP 不参与聚类。IPv4 映射 IPv6 归入对应 IPv4；其他 IPv6 按完整地址统计。

`MELON_CLIENT_IP_SOURCE` 默认不信任任何来源头：

- `nginx`：仅用于应用端口不对公网开放、且 Nginx 使用 `proxy_set_header X-Forwarded-For $remote_addr` **覆盖**来源头的部署。拒绝逗号转发链及其他来源头。Compose 已采用此模式。
- `cloudflare`：仅用于 Cloudflare Worker，由平台提供 `CF-Connecting-IP`；不能用于可以绕过代理访问的普通 Node 服务。

未来 Cloudflare + ECS 部署仍使用 `nginx` 模式。Nginx 仅信任 Cloudflare 官方网段的 `CF-Connecting-IP`，再向应用覆盖写入来源头。注册、检测及事件成员快照为同一事务，时间在数据库写入时确定，避免并发请求以旧时间漏计。

IP、封禁原因及审计信息只通过管理员接口提供，响应禁止缓存；公开个人主页不包含这些字段。

## 封禁与整场牌局

账号有 `active`、`restricted`、`banned` 三种状态。无进行中牌局时封禁立即撤销所有会话。已有进行中牌局时，绑定当前房间进入限制状态：已有会话仅能完成该场牌局，不能重新登录或参与论坛、签到及其他房间。

斗地主本局结算后生效；掼蛋可继续下一副的准备和贡还，直到整场过 A 或提前退出、关闭、失效。状态在服务端持久保存，重启不丢失。解封可取消待生效限制。结算及账号状态更新使用事务和版本校验；准备开新场时再次检查全桌状态。

整场结束时撤销认证会话，并为原会话保存最长 5 分钟的只读结算回执，仅能读取指定房间已结束的公开结果；不能用于认证或写操作。前端收到结果后清除登录状态、停止轮询并保留剩余牌展示。后台检查及身份校验也会收敛已经退出或失效的临时权限。

数据库触发器额外阻止受限账号的社区、签到及新会话写入，处理身份检查与管理员封禁并发的情况。内容管理员仍能隐藏和恢复该账号的帖子或回复。

## 接口

所有路径均兼容应用路径前缀，管理员接口要求管理员身份；写操作沿用统一同源校验。

| 接口 | 行为 |
| --- | --- |
| `GET /api/admin/users?q=&status=&alert=&page=1` | 按用户名或昵称、状态或可疑事件筛选；返回 `items,total,page,pageSize,registrationAlert`。`status` 可为 `active/restricted/banned/suspicious`，默认全部 |
| `GET /api/admin/users/:id` | 返回账号及最近一次注册标记，不返回密码或会话 |
| `PATCH /api/admin/users/:id` | `{action:"ban"或"unban",reason:"1–200字符"}`，返回最新账号状态 |
| `GET /api/admin/users/:id/audit?page=1` | 分页返回操作记录 |
| `GET /api/auth/me` | 用户信息补充 `account_status,restricted_room_id,ban_reason,account_version`，均为本人信息 |

未登录返回 401，越权、跨站或受限操作返回 403，账号不存在返回 404，并发状态变化返回 409。原有管理接口保持兼容。

## 验证与回退

`npm run test:accounts` 检查地址规范化、可信头及旧库迁移；`npm run test:accounts-api` 在独立 `account-qa` 数据目录检查完整接口及两种游戏权限。`npm run test:accounts-persistence -- prepare` 创建虚构数据，实际重启测试服务后运行 `-- verify`。测试地址必须为回环地址；测试库不可用于生产。

本次迁移为新增字段、表、索引和触发器，旧数据不需要重建。发布前备份数据、镜像及 Compose，避开进行中的牌局。

回退到不含账号管理的旧镜像前，先停止入口写流量并确认没有进行中牌局，再在当前应用容器执行以下事务，使旧镜像也无法继续使用受限账号的原会话：

```sql
BEGIN IMMEDIATE;
UPDATE users SET account_status='banned',restricted_room_id=NULL,account_version=account_version+1
WHERE account_status='restricted';
DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_status='banned');
DELETE FROM game_result_receipts;
COMMIT;
```

随后恢复备份的镜像和 Compose，保留当前数据库及新增触发器。旧版不再提供账号管理及注册事件记录；受限账号的新登录仍被数据库阻止，但旧版会显示通用错误。重新部署新版后再由管理员处理解封。不要使用旧数据库覆盖新产生的数据，也不要仅关闭前端入口来代替权限回退。
