import {
  all,
  one,
  run,
  db,
  now,
  id,
  json,
  fail,
  getUser,
  requireUser,
  body,
  str,
} from "@/lib/server";
import { visiblePost, postSelect, selectArgs } from "./queries";

export async function postsAPI(
  req: Request,
  key?: string,
  action?: string,
): Promise<Response | undefined> {
  const method = req.method;
  const url = new URL(req.url);

  if (method === "GET" && !key) {
    const user = await getUser(req),
      conditions = ["p.hidden=0"],
      values: unknown[] = [];
    const category = url.searchParams.get("category"),
      q = url.searchParams.get("q"),
      view = url.searchParams.get("view"),
      author = url.searchParams.get("author");
    if (category) {
      conditions.push("p.category_id=?");
      values.push(category);
    }
    if (q) {
      conditions.push(
        "(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')",
      );
      const query = "%" + q.slice(0, 100).replace(/[\\%_]/g, "\\$&") + "%";
      values.push(query, query);
    }
    if (view === "featured") conditions.push("p.featured=1");
    if (author) {
      conditions.push("p.user_id=?");
      values.push(author);
    }
    const where = conditions.join(" AND "),
      page = Math.max(
        1,
        Math.min(100000, Number(url.searchParams.get("page")) || 1),
      );
    const count = await one<{ total: number }>(
      `SELECT COUNT(*) total FROM posts p WHERE ${where}`,
      ...values,
    );
    const items = await all(
      `${postSelect} WHERE ${where} ORDER BY ${view === "ranking" ? "" : "p.pinned DESC,"}${view === "hot" || view === "ranking" ? "heat DESC," : ""}p.created_at DESC,p.id DESC LIMIT 20 OFFSET ?`,
      ...selectArgs(user),
      ...values,
      (Math.floor(page) - 1) * 20,
    );
    return json({ items, total: count!.total, page: Math.floor(page) });
  }
  if (method === "GET" && key) {
    await visiblePost(key);
    const user = await getUser(req);
    const post = await one(
      `${postSelect} WHERE p.id=?`,
      ...selectArgs(user),
      key,
    );
    const replies = await all(
      `SELECT r.*,u.nickname,u.username,CASE WHEN q.hidden=0 THEN q.body ELSE NULL END quote_body,CASE WHEN q.hidden=0 THEN qu.nickname ELSE NULL END quote_nickname FROM replies r JOIN users u ON u.id=r.user_id LEFT JOIN replies q ON q.id=r.quote_id LEFT JOIN users qu ON qu.id=q.user_id WHERE r.post_id=? AND r.hidden=0 ORDER BY r.created_at,r.id`,
      key,
    );
    const images = await all(
      "SELECT id FROM uploads WHERE post_id=? ORDER BY created_at",
      key,
    );
    return json({ post, replies, images });
  }
  if ((method === "POST" && !key) || (method === "PATCH" && key && !action)) {
    const user = await requireUser(req),
      b = await body(req),
      title = str(b.title, "标题", 3, 100),
      content = str(b.body, "正文", 5, 20000),
      category = str(b.category_id, "分区", 1, 40);
    if (!(await one("SELECT id FROM categories WHERE id=?", category)))
      fail("请选择有效分区");
    const images = b.images || [];
    if (
      !Array.isArray(images) ||
      images.length > 9 ||
      images.some((x) => typeof x !== "string") ||
      new Set(images).size !== images.length
    )
      fail("每篇帖子最多上传 9 张不同的图片");
    if (key) {
      const p = await visiblePost(key);
      if (p.user_id !== user.id) fail("只能编辑自己的帖子", 403);
    }
    for (const image of images) {
      const upload = await one<{ user_id: string; post_id: string | null }>(
        "SELECT * FROM uploads WHERE id=?",
        image,
      );
      if (
        !upload ||
        upload.user_id !== user.id ||
        (upload.post_id && upload.post_id !== key)
      )
        fail("图片不可用，请重新上传");
    }
    const pid = key || id(),
      time = now();
    const statements = key
      ? [
          db()
            .prepare(
              "UPDATE posts SET title=?,body=?,category_id=?,updated_at=? WHERE id=?",
            )
            .bind(title, content, category, time, pid),
          db()
            .prepare("UPDATE uploads SET post_id=NULL WHERE post_id=?")
            .bind(pid),
        ]
      : [
          db()
            .prepare(
              "INSERT INTO posts(id,user_id,category_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
            )
            .bind(pid, user.id, category, title, content, time, time),
        ];
    for (const image of images)
      statements.push(
        db()
          .prepare("UPDATE uploads SET post_id=? WHERE id=?")
          .bind(pid, image),
      );
    await db().batch(statements);
    return json({ id: pid }, key ? 200 : 201);
  }
  if (method === "POST" && key && action === "replies") {
    const user = await requireUser(req);
    await visiblePost(key);
    const b = await body(req),
      content = str(b.body, "回复", 1, 5000);
    if (
      b.quote_id &&
      !(await one(
        "SELECT id FROM replies WHERE id=? AND post_id=? AND hidden=0",
        b.quote_id,
        key,
      ))
    )
      fail("引用的回复不存在");
    const rid = id();
    await run(
      "INSERT INTO replies(id,post_id,user_id,quote_id,body,created_at) VALUES(?,?,?,?,?,?)",
      rid,
      key,
      user.id,
      b.quote_id || null,
      content,
      now(),
    );
    return json({ id: rid }, 201);
  }
  if (key && action === "like" && (method === "POST" || method === "DELETE")) {
    const user = await requireUser(req);
    await visiblePost(key);
    if (method === "POST")
      await run(
        "INSERT INTO likes(post_id,user_id,created_at) VALUES(?,?,?) ON CONFLICT DO NOTHING",
        key,
        user.id,
        now(),
      );
    else
      await run(
        "DELETE FROM likes WHERE post_id=? AND user_id=?",
        key,
        user.id,
      );
    return json({ ok: true });
  }
}
