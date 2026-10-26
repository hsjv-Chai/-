import { all, one, run, json, fail, requireAdmin, body } from "@/lib/server";

export async function adminAPI(
  req: Request,
  key?: string,
  action?: string,
): Promise<Response | undefined> {
  const method = req.method;

  await requireAdmin(req);
  if (method === "GET") {
    return json({
      posts: await all(
        "SELECT p.*,u.nickname FROM posts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC",
      ),
      replies: await all(
        "SELECT r.*,u.nickname,p.title FROM replies r JOIN users u ON u.id=r.user_id JOIN posts p ON p.id=r.post_id ORDER BY r.created_at DESC",
      ),
    });
  }
  if (method === "PATCH" && key && action) {
    const b = await body(req);
    if (key === "posts") {
      if (!(await one("SELECT id FROM posts WHERE id=?", action)))
        fail("帖子不存在", 404);
      const field = b.field;
      if (
        !["featured", "pinned", "hidden"].includes(field) ||
        typeof b.value !== "boolean"
      )
        fail("无效的管理操作");
      if (field === "pinned" && b.value) {
        const result = await run(
          "UPDATE posts SET pinned=1 WHERE id=? AND (pinned=1 OR (SELECT COUNT(*) FROM posts WHERE pinned=1)<3)",
          action,
        );
        if (!result.meta.changes) fail("最多置顶 3 条，请先取消其他置顶");
      } else
        await run(
          `UPDATE posts SET ${field}=? WHERE id=?`,
          b.value ? 1 : 0,
          action,
        );
      return json({ ok: true });
    }
    if (key === "replies") {
      if (typeof b.value !== "boolean") fail("无效的管理操作");
      const result = await run(
        "UPDATE replies SET hidden=? WHERE id=?",
        b.value ? 1 : 0,
        action,
      );
      if (!result.meta.changes) fail("回复不存在", 404);
      return json({ ok: true });
    }
  }
}
