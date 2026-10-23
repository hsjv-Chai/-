import {gardenAPI} from "@/lib/garden/api";
import {gamesAPI} from "@/lib/games/api";
import {stripBasePath} from "@/lib/paths";
import { env } from "@/lib/storage-runtime";
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
  requireAdmin,
  sameOrigin,
  body,
  str,
  sha,
  passwordHash,
  cookie,
  visiblePost,
  postSelect,
  selectArgs,
} from "@/lib/server";
export const dynamic = "force-dynamic";
async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url),
      parts = stripBasePath(url.pathname).slice(5).split("/").filter(Boolean),
      [resource, key, action] = parts,
      method = req.method;
    if (method !== "GET") sameOrigin(req);
    if(resource === "garden") return await gardenAPI(req,parts.slice(1));
    if(resource === "games") return await gamesAPI(req,key);
    if(resource === "health" && method === "GET") {await one("SELECT 1 AS ok");return json({ok:true});}
    if (resource === "auth") {
      if (method === "GET" && key === "me")
        return json({ user: await getUser(req) });
      if (method === "POST" && key === "logout") {
        const token = req.headers
          .get("cookie")
          ?.match(/(?:^|;\s*)melon_session=([^;]+)/)?.[1];
        if (token)
          await run("DELETE FROM sessions WHERE token=?", await sha(token));
        return json({ ok: true }, 200, { "Set-Cookie": cookie("", req, 0) });
      }
      if (method === "POST" && (key === "register" || key === "login")) {
        const b = await body(req),
          username = str(b.username, "用户名", 3, 24).toLowerCase(),
          password = str(b.password, "密码", 8, 128);
        if (!/^[a-z0-9_]+$/.test(username))
          fail("用户名只能包含英文字母、数字和下划线");
        const throttle = await one<{ count: number; expires: number }>(
          "SELECT * FROM auth_attempts WHERE key=?",
          username,
        );
        if (throttle && throttle.expires > now() && throttle.count >= 10)
          fail("尝试过于频繁，请 15 分钟后再试", 429);
        await run(
          "INSERT INTO auth_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END",
          username,
          now() + 900000,
          now(),
          now(),
        );
        let user = await one<{ id: string; password: string }>(
          "SELECT * FROM users WHERE username=?",
          username,
        );
        if (key === "register") {
          const nickname = str(b.nickname, "昵称", 2, 20);
          if (user) fail("这个用户名已被使用", 409);
          const uid = id();
          await run(
            "INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)",
            uid,
            username,
            nickname,
            await passwordHash(password),
            "member",
            now(),
          );
          user = { id: uid, password: "" };
        } else {
          const hash = await passwordHash(
            password,
            user?.password.split(":")[0] || "invalid-user-salt",
          );
          if (!user || hash !== user.password) fail("用户名或密码不正确", 401);
        }
        await run("DELETE FROM auth_attempts WHERE key=?", username);
        const token = id() + id();
        await run(
          "INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)",
          await sha(token),
          user!.id,
          now() + 604800000,
        );
        return json({ ok: true }, 200, { "Set-Cookie": cookie(token, req) });
      }
    }
    if (resource === "categories" && method === "GET")
      return json(
        await all(
          "SELECT c.*,(SELECT COUNT(*) FROM posts p WHERE p.category_id=c.id AND p.hidden=0) AS count FROM categories c ORDER BY c.rowid",
        ),
      );
    if (resource === "stats" && method === "GET")
      return json(
        await one(
          "SELECT (SELECT COUNT(*) FROM posts WHERE hidden=0) posts,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM replies r JOIN posts p ON p.id=r.post_id WHERE r.hidden=0 AND p.hidden=0) replies",
        ),
      );
    if (resource === "posts") {
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
      if (
        (method === "POST" && !key) ||
        (method === "PATCH" && key && !action)
      ) {
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
      if (
        key &&
        action === "like" &&
        (method === "POST" || method === "DELETE")
      ) {
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
    if (resource === "uploads") {
      if (method === "POST" && !key) {
        const user = await requireUser(req);
        if (
          Number(req.headers.get("content-length") || 0) >
          5 * 1024 * 1024 + 10000
        )
          fail("每张图片不能超过 5 MB", 413);
        const form = await req.formData(),
          file = form.get("file");
        if (!(file instanceof File) || file.size === 0) fail("请选择图片");
        if (file.size > 5 * 1024 * 1024) fail("每张图片不能超过 5 MB", 413);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const mime =
          bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
            ? "image/jpeg"
            : bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
              ? "image/png"
              : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
                  String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
                ? "image/webp"
                : null;
        if (!mime || mime !== file.type)
          fail("仅支持有效的 JPEG、PNG 或 WebP 图片");
        const uid = id();
        await env.BUCKET!.put(uid, bytes, {
          httpMetadata: { contentType: mime },
        });
        try {
          await run(
            "INSERT INTO uploads(id,user_id,mime,created_at) VALUES(?,?,?,?)",
            uid,
            user.id,
            mime,
            now(),
          );
        } catch (e) {
          await env.BUCKET!.delete(uid);
          throw e;
        }
        return json({ id: uid }, 201);
      }
      if (method === "GET" && key) {
        const item = await one<{
          post_id: string | null;
          user_id: string;
          mime: string;
          hidden: number | null;
        }>(
          "SELECT i.*,p.hidden FROM uploads i LEFT JOIN posts p ON p.id=i.post_id WHERE i.id=?",
          key,
        );
        if (!item) fail("图片不存在", 404);
        if (!item.post_id || item.hidden) {
          const user = await getUser(req);
          if (!user || (user.id !== item.user_id && user.role !== "admin"))
            fail("图片不存在", 404);
        }
        const file = await env.BUCKET!.get(key);
        if (!file) fail("图片不存在", 404);
        return new Response(file.body, {
          headers: {
            "Content-Type": item.mime,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
    }
    if (resource === "users" && key && method === "GET") {
      const user = await one(
        "SELECT id,username,nickname,created_at FROM users WHERE id=?",
        key,
      );
      if (!user) fail("用户不存在", 404);
      const replies = await all(
        "SELECT r.*,p.title FROM replies r JOIN posts p ON p.id=r.post_id WHERE r.user_id=? AND r.hidden=0 AND p.hidden=0 ORDER BY r.created_at DESC LIMIT 100",
        key,
      );
      return json({ user, replies });
    }
    if (resource === "admin") {
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
    return json({ error: "接口不存在" }, 404);
  } catch (error) {
    const e = error as Error & { status?: number };
    if (!e.status) console.error(e);
    return json(
      { error: e.status ? e.message : "服务暂时出了点问题，请稍后重试" },
      e.status || 500,
    );
  }
}
export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
