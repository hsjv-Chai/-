import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { sql, sqlQuote as q, wrangler } from "./local-db.mjs";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5173";
const tag = "qa_" + Date.now();
let checks = 0;
const users = [],
  uploads = [];
const A = { cookie: "" },
  B = { cookie: "" };
async function request(path, method = "GET", data, client = A, status = 200) {
  const headers = { Origin: new URL(base).origin };
  if (client.cookie) headers.Cookie = client.cookie;
  if (!(data instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(base + "/api/" + path, {
    method,
    headers,
    body:
      data instanceof FormData
        ? data
        : data === undefined
          ? undefined
          : JSON.stringify(data),
  });
  let result;
  const content = response.headers.get("Content-Type") || "";
  result = content.includes("application/json")
    ? await response.json()
    : new Uint8Array(await response.arrayBuffer());
  assert.equal(
    response.status,
    status,
    `${method} ${path}: ${JSON.stringify(result)}`,
  );
  checks++;
  const cookie = response.headers.get("set-cookie");
  if (cookie) client.cookie = cookie.split(";")[0];
  return result;
}
function check(value, message) {
  assert.ok(value, message);
  checks++;
}
function form(bytes, type = "image/png") {
  const f = new FormData();
  f.append("file", new Blob([bytes], { type }), "qa.png");
  return f;
}
try {
  const category = await request("categories");
  check(category.length === 4, "four categories");
  for (const [client, suffix] of [
    [A, "a"],
    [B, "b"],
  ]) {
    const username = tag + suffix;
    await request(
      "auth/register",
      "POST",
      {
        username,
        nickname: suffix === "a" ? "验证瓜友甲" : "验证瓜友乙",
        password: "LocalQa_12345678",
        role: "admin",
      },
      client,
    );
    const me = await request("auth/me", "GET", undefined, client);
    check(me.user.role === "member", "cannot register admin");
    users.push(me.user);
    check(client.cookie.startsWith("melon_session="), "session cookie");
  }
  await request(
    "auth/register",
    "POST",
    { username: tag + "a", nickname: "重复用户", password: "LocalQa_12345678" },
    B,
    409,
  );
  await request(
    "auth/login",
    "POST",
    { username: tag + "a", password: "incorrect_123" },
    {},
    401,
  );
  await request("admin", "GET", undefined, B, 403);
  await request(
    "posts",
    "POST",
    { title: "测试空正文", category_id: "hot", body: "" },
    A,
    400,
  );
  await request(
    "posts",
    "POST",
    { title: "游客写入测试", category_id: "hot", body: "游客不可以写入" },
    {},
    401,
  );
  await request(
    "uploads",
    "POST",
    form(new TextEncoder().encode("<script>bad</script>")),
    A,
    400,
  );
  await request(
    "uploads",
    "POST",
    form(new Uint8Array(5 * 1024 * 1024 + 1)),
    A,
    413,
  );
  const png = readFileSync(".sites-runtime/seed/demo-image-4.png");
  const upload = await request("uploads", "POST", form(png), A, 201);
  uploads.push(upload.id);
  await request("uploads/" + upload.id, "GET", undefined, B, 404);
  const post = await request(
    "posts",
    "POST",
    {
      title: tag + " 一篇本地图文话题",
      category_id: "life",
      body: "**本地验证**\n\nhttps://example.com\n<script>never executed</script>",
      images: [upload.id],
    },
    A,
    201,
  );
  let detail = await request("posts/" + post.id);
  check(
    detail.images.length === 1 && detail.post.like_count === 0,
    "post persisted",
  );
  const image = await request("uploads/" + upload.id, "GET", undefined, B);
  check(image.length === png.length, "image bytes available");
  await request(
    "posts/" + post.id,
    "PATCH",
    { title: "越权修改标题", category_id: "life", body: "别人不应修改成功" },
    B,
    403,
  );
  await request(
    "posts",
    "POST",
    {
      title: "盗用图片测试",
      category_id: "life",
      body: "不应引用其他用户图片",
      images: [upload.id],
    },
    B,
    400,
  );
  await request(
    "posts/" + post.id,
    "PATCH",
    {
      title: tag + " 已编辑的图文话题",
      category_id: "tech",
      body: "正文已编辑，仍保留图片。",
      images: [upload.id],
    },
    A,
  );
  await request("posts/" + post.id + "/like", "POST", undefined, B);
  await request("posts/" + post.id + "/like", "POST", undefined, B);
  const r1 = await request(
    "posts/" + post.id + "/replies",
    "POST",
    { body: "第一条回复" },
    B,
    201,
  );
  await request(
    "posts/" + post.id + "/replies",
    "POST",
    { body: "同日第二条引用", quote_id: r1.id },
    B,
    201,
  );
  await request(
    "posts/" + post.id + "/replies",
    "POST",
    { body: "楼主自己回复" },
    A,
    201,
  );
  detail = await request("posts/" + post.id, "GET", undefined, B);
  check(
    detail.post.like_count === 1 &&
      detail.post.reply_count === 3 &&
      detail.post.heat === 3,
    "heat dedupes replies and excludes author",
  );
  check(
    detail.replies.some((r) => r.quote_body === "第一条回复"),
    "quote resolved",
  );
  await request("posts/" + post.id + "/like", "DELETE", undefined, B);
  detail = await request("posts/" + post.id);
  check(detail.post.like_count === 0 && detail.post.heat === 2, "unlike heat");
  const other = await request(
    "posts",
    "POST",
    {
      title: tag + " 第二篇测试帖子",
      category_id: "hot",
      body: "用来验证引用不能跨帖子。",
    },
    B,
    201,
  );
  await request(
    "posts/" + other.id + "/replies",
    "POST",
    { body: "跨帖引用", quote_id: r1.id },
    A,
    400,
  );
  await request(
    "posts/" + post.id + "/replies",
    "POST",
    { body: "   " },
    A,
    400,
  );
  const result = await request("posts?q=" + tag + "&category=tech");
  check(
    result.items.length === 1 && result.items[0].id === post.id,
    "search and category intersect",
  );
  await request("posts/not-found", "GET", undefined, A, 404);
  await request(
    "posts/" + post.id + "/like",
    "POST",
    undefined,
    { cookie: "melon_session=expired" },
    401,
  );
  const foreign = await fetch(base + "/api/posts/" + post.id + "/like", {
    method: "POST",
    headers: { Origin: "https://untrusted.example", Cookie: A.cookie },
  });
  check(foreign.status === 403, "origin protected");
  sql(`UPDATE users SET role='admin' WHERE id=${q(users[0].id)}`);
  await request(
    "admin/posts/" + post.id,
    "PATCH",
    { field: "featured", value: true },
    A,
  );
  let picked = await request("posts?view=featured&q=" + tag);
  check(picked.items.length === 1, "featured filter");
  const existingPins = sql(
    "SELECT COUNT(*) n FROM posts WHERE pinned=1",
    true,
  )[0].n;
  let pinIds = [];
  for (let i = 0; i < 4; i++) {
    const p = await request(
      "posts",
      "POST",
      {
        title: tag + " 置顶测试 " + i,
        category_id: "hot",
        body: "验证原子置顶上限。",
      },
      A,
      201,
    );
    pinIds.push(p.id);
  }
  for (let i = 0; i < 3 - existingPins; i++)
    await request("admin/posts/" + pinIds[i], "PATCH", {
      field: "pinned",
      value: true,
    });
  await request(
    "admin/posts/" + pinIds[3],
    "PATCH",
    { field: "pinned", value: true },
    A,
    400,
  );
  await request("admin/replies/" + r1.id, "PATCH", { value: true });
  detail = await request("posts/" + post.id);
  check(
    detail.post.reply_count === 2 && detail.replies.every((r) => !r.quote_body),
    "hidden quote removed",
  );
  await request("admin/posts/" + post.id, "PATCH", {
    field: "hidden",
    value: true,
  });
  await request("posts/" + post.id, "GET", undefined, B, 404);
  await request("uploads/" + upload.id, "GET", undefined, B, 404);
  picked = await request("posts?view=featured&q=" + tag);
  check(picked.items.length === 0, "hidden removed from lists");
  await request("admin/posts/" + post.id, "PATCH", {
    field: "hidden",
    value: false,
  });
  await request("admin/replies/" + r1.id, "PATCH", { value: false });
  detail = await request("posts/" + post.id);
  check(detail.post.reply_count === 3, "restore reply");
  // More than one page, identical timestamps, stable ordering, and a ranking entry beyond 20.
  const time = Date.now();
  let queries = [];
  for (let i = 0; i < 22; i++)
    queries.push(
      `INSERT INTO posts(id,user_id,category_id,title,body,created_at,updated_at) VALUES(${q(tag + "page" + i)},${q(users[0].id)},'life',${q(tag + "分页 " + i)},'分页验证正文',${time - i},${time - i})`,
    );
  writeFileSync(".sites-runtime/qa-insert.sql", queries.join(";") + ";");
  wrangler([
    "d1",
    "execute",
    "DB",
    "--local",
    "--config",
    "dist/server/wrangler.json",
    "--persist-to",
    ".wrangler/state",
    "--file",
    ".sites-runtime/qa-insert.sql",
  ]);
  const page1 = await request("posts?q=" + tag + "&page=1"),
    page2 = await request("posts?q=" + tag + "&page=2");
  check(page1.items.length === 20 && page2.items.length === 8, "20 per page");
  check(
    !page1.items.some((a) => page2.items.some((b) => a.id === b.id)),
    "no duplicate pages",
  );
  const me = await request("users/" + users[1].id);
  check(me.replies.length >= 2, "profile replies");
  await request("auth/logout", "POST", undefined, B);
  check(
    (await request("auth/me", "GET", undefined, B)).user === null,
    "logout invalidates session",
  );
  await request(
    "auth/login",
    "POST",
    { username: tag + "b", password: "LocalQa_12345678" },
    B,
  );
  check(
    (await request("auth/me", "GET", undefined, B)).user.id === users[1].id,
    "login after logout",
  );
  console.log(`PASS: ${checks} API / integrity assertions`);
} finally {
  if (users.length) {
    const ids = users.map((u) => q(u.id)).join(",");
    const cleanup = [
      `DELETE FROM likes WHERE user_id IN (${ids}) OR post_id IN (SELECT id FROM posts WHERE user_id IN (${ids}))`,
      `DELETE FROM replies WHERE user_id IN (${ids}) OR post_id IN (SELECT id FROM posts WHERE user_id IN (${ids}))`,
      `DELETE FROM uploads WHERE user_id IN (${ids})`,
      `DELETE FROM posts WHERE user_id IN (${ids})`,
      `DELETE FROM sessions WHERE user_id IN (${ids})`,
      `DELETE FROM auth_attempts WHERE key LIKE ${q(tag + "%")}`,
      `DELETE FROM users WHERE id IN (${ids})`,
    ];
    writeFileSync(".sites-runtime/qa-cleanup.sql", cleanup.join(";") + ";");
    wrangler([
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
      "--file",
      ".sites-runtime/qa-cleanup.sql",
    ]);
  }
  for (const image of uploads)
    wrangler([
      "r2",
      "object",
      "delete",
      "site-creator-r2/" + image,
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      ".wrangler/state",
    ]);
}
