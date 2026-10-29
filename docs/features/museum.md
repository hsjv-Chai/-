# 🍉 博物馆

游客从导航进入 `/museum`，按标题或简介搜索展览，每页 12 场；最新发布的主展不会在同页网格重复。展览页每页 20 件展品，按策展顺序展示。展品支持图集放大、复制分享链接、上一件与下一件。部署前缀为 `/melon` 时，上述地址自动带此前缀。

本期不开放用户投稿、点赞或评论，不做永久删除、定时发布和历史版本回滚。

## 管理员策展

1. 使用状态正常的管理员账户进入「社区管理 → 博物馆」或 `/admin/museum`，选择「新建展览」。
2. 填写标题、简介、Markdown 策展介绍，上传封面并填写图片说明。允许保存不完整草稿。
3. 添加展品，填写标题、Markdown 介绍、图片说明；作者、年代、来源和图注选填。每件 1–9 张 JPEG、PNG 或 WebP，每张最多 5 MB。上传后还需保存草稿。
4. 使用上移、下移排序；从草稿移出展品不立即影响公开版。保存失败时输入会保留，修正后重试。
5. 保存全部修改，打开「预览已保存草稿」。确认版本内容后勾选预览确认，再发布。发布至少要求展览标题、简介、封面及一件完整展品，整场一次生效。
6. 已公开的展览可继续编辑草稿，游客仍看到上次公开版。再次预览并发布才会更新。
7. 下架需页内确认；游客立即失去展览、展品和专属图片的读取权限。资料保留，重新公开仍须预览并发布。

所有保存、排序、发布与下架操作带版本号。若其他页面先保存，返回 409 并保留本页输入；先复制需要保留的内容，再确认重新加载最新草稿。管理员不能使用论坛附件或其他展览的图片。

## 本地演示

仅向显式指定的隔离目录写入，两场虚构展览、六件展品和原创 PNG 示意图；不会自动填充真实站点。重复执行不覆盖已存在的演示内容。

```sh
export MELON_STORAGE=node
export MELON_DATA_DIR="$PWD/.sites-runtime/museum-demo"
export MELON_PUBLIC_ORIGIN=http://127.0.0.1:5200
export NEXT_PUBLIC_BASE_PATH=/melon
npm run init:ecs
npm run museum:seed
npx next dev --webpack --hostname 127.0.0.1 --port 5200
```

初始管理员凭据保存在隔离目录 `initial-admin.txt`，不要提交或分享。演示脚本拒绝普通数据目录；正常站点初始化仍为空馆。移除前缀时将 `NEXT_PUBLIC_BASE_PATH` 设为空字符串。

## 接口与隐私

公共 GET 入口为 `/api/museum/exhibitions`、`/api/museum/exhibitions/:id`、`/api/museum/items/:id`、`/api/museum/images/:id`。

管理员入口为 `/api/admin/museum/exhibitions`：GET 列表、POST 新建；`/:id` GET/PATCH；`/:id/preview` GET；`/:id/images` POST 上传；`/:id/items` POST；`/:id/items/:itemId` PATCH/DELETE；`/:id/reorder`、`/:id/publish`、`/:id/unpublish` POST。写入使用既有同源保护，除上传外请求为 JSON，变更需携带 `revision`。

公开响应不包含策展账户的邮箱、IP 或身份资料。图片读取每次检查当前公开版引用，返回 `private, no-store`；HTML、API 和预览也禁止缓存。原始 HTML 沿用现有安全 Markdown 渲染，只作为文字显示。

## 迁移、备份与回退

新增迁移 `0005_rainy_brother_voodoo` 只创建五张博物馆表。Node 初始化自动应用；本地 Worker 使用 `npm run db:migrate`。本轮不部署，不修改已有站点数据。

将来发布前按既有流程备份完整数据库、图片、运行配置和镜像；先在副本应用迁移。应用回退可恢复旧镜像及配置，但保留新增表和图片，不用旧数据库覆盖发布后产生的数据。回退后旧版本不再提供博物馆入口，必要时额外封闭博物馆路由。避免在服务写入时直接复制活跃 SQLite 文件；使用 SQLite 在线备份或暂停服务后复制完整数据目录。

测试步骤及实际结果见 [博物馆验证记录](../verification/museum.md)。
