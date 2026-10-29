# 博物馆服务端

博物馆是独立业务模块，不以论坛帖子充当展品。

| 文件 | 职责 |
| --- | --- |
| `model.ts` | 客户端可导入的类型、空草稿及输入/发布校验 |
| `public.ts` | 公开展览搜索、分页、展品与相邻展品读取 |
| `admin.ts` | 管理员草稿、排序、预览、发布和下架 |
| `images.ts` | 专属图片上传、内容标识校验和当前版本可见性 |
| `store.ts` | 读取草稿、图片归属、带账号版本校验的乐观并发写入 |

页面 → `components/museum/` → 社区客户端请求工具 → 统一 API 入口 → 本模块 → 共享身份及存储。除 `model.ts` 外，上述文件仅供服务端导入。

草稿存在展览和展品表；每次发布在同一事务复制整场内容到不可变公开版本，再更新公开指针。所有草稿变更带 `revision`，CAS 不匹配返回 409；唯一操作标记使事务内后续语句只在 CAS 成功时执行。Node 的 `BEGIN IMMEDIATE` 与 D1 的事务批处理提供原子性。

图片属于指定展览，只允许引用该展览上传的图片。游客读取时检查当前公开版本，历史版本、草稿或下架展览的图片不会因知道 URL 而公开。未引用的上传文件暂时保留，不在本期自动清理。HTML、JSON 和图片均禁止缓存。

迁移为 `drizzle/0005_rainy_brother_voodoo.sql`。测试见 `tests/unit/test-museum.mts`、`tests/integration/test-museum-api.mjs`；使用方式见 [博物馆说明](../../docs/features/museum.md)。
