import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  nodeStorage,
  openConnection,
  dataDir,
} from "../../lib/node-storage.mjs";
const file = join(dataDir(), ".deployment-qa.json"),
  base = process.env.MELON_TEST_URL || "http://127.0.0.1:3000/melon";
if (
  !["127.0.0.1", "localhost"].includes(new URL(base).hostname) ||
  !dataDir().includes("qa")
)
  throw Error("Requires an isolated loopback QA database");
let state = { cookie: "" };
async function call(path, method = "GET", body) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: process.env.MELON_PUBLIC_ORIGIN,
      Cookie: state.cookie,
      ...(body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  assert.ok(r.ok, `${path}: ${r.status}`);
  if (r.headers.has("set-cookie")) {
    const raw = r.headers.get("set-cookie");
    assert.ok(
      raw.includes("Secure") &&
        raw.includes("HttpOnly") &&
        raw.includes(
          "Path=" + (new URL(base).pathname.replace(/\/$/, "") || "/") + ";",
        ),
    );
    state.cookie = raw.split(";")[0];
  }
  return r.headers.get("content-type")?.includes("application/json")
    ? r.json()
    : new Uint8Array(await r.arrayBuffer());
}
if (process.argv[2] === "prepare") {
  assert.ok(!existsSync(file), "A pending test already exists");
  const username = "qa_ecs_" + Date.now();
  await call("auth/register", "POST", {
    username,
    nickname: "部署验证临时用户",
    password: "OnlyForDeployment_8231",
  });
  state.user = (await call("auth/me")).user.id;
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  const png = readFileSync(new URL("../fixtures/image.png", import.meta.url)),
    form = new FormData();
  form.append("file", new Blob([png], { type: "image/png" }), "qa.png");
  state.image = (await call("uploads", "POST", form)).id;
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  state.post = (
    await call("posts", "POST", {
      title: "部署持久化验证临时帖子",
      body: "容器重启后应保留内容与图片；验证后自动清理。",
      category_id: "tech",
      images: [state.image],
    })
  ).id;
  writeFileSync(file, JSON.stringify(state), { mode: 0o600 });
  await call("posts/" + state.post + "/replies", "POST", {
    body: "部署验证回复",
  });
  await call("posts/" + state.post + "/like", "POST");
  console.log(
    "Prepared temporary account, image, thread, reply, like and session.",
  );
} else if (process.argv[2] === "verify") {
  state = JSON.parse(readFileSync(file, "utf8"));
  try {
    assert.equal((await call("auth/me")).user.id, state.user);
    const result = await call("posts/" + state.post);
    assert.equal(result.replies.length, 1);
    assert.equal(result.post.like_count, 1);
    assert.equal(result.post.liked, 1);
    assert.equal(result.images[0].id, state.image);
    assert.ok((await call("uploads/" + state.image)).length > 8);
    console.log(
      "PASS: service restart preserved account, session, thread, image, reply and like.",
    );
  } finally {
    const db = openConnection();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const table of ["likes", "replies", "uploads", "posts", "sessions"])
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(state.user);
      db.prepare(
        "DELETE FROM auth_attempts WHERE key IN (SELECT username FROM users WHERE id=?)",
      ).run(state.user);
      db.prepare("DELETE FROM users WHERE id=?").run(state.user);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    if (state.image) await nodeStorage.BUCKET.delete(state.image);
    unlinkSync(file);
    console.log("Temporary deployment data removed.");
  }
} else throw new Error("Use prepare or verify");
