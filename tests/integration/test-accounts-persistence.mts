import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { openConnection, dataDir } from "../../lib/node-storage.mjs";
import { createState, dealRound } from "../../lib/games/engine.ts";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5188/melon",
  file = join(dataDir(), "accounts-restart-qa.json");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert.ok(dataDir().includes("account-qa"));
const db = openConnection();
async function req(
  path: string,
  client: any,
  method = "GET",
  body?: object,
  ip = "unknown",
  status = 200,
) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: new URL(base).origin,
      "X-Forwarded-For": ip,
      ...(client ? { Cookie: client.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await r.json();
  assert.equal(r.status, status, JSON.stringify(data));
  return { data, cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
if (process.argv[2] === "prepare") {
  const password = "LocalAccountQa_12345";
  async function register(username: string, nickname: string, ip?: string) {
    const c = {
      username,
      nickname,
      cookie: (
        await req(
          "auth/register",
          null,
          "POST",
          { username, nickname, password },
          ip,
        )
      ).cookie,
    };
    return { ...c, id: (await req("auth/me", c)).data.user.id };
  }
  const admin = await register("qa_account_admin", "后台验证员");
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.id);
  const users = [];
  for (let i = 0; i < 5; i++)
    users.push(
      await register("qa_account_" + i, "同批验证瓜友" + i, "198.51.100.21"),
    );
  const s = createState("guandan", { ...users[0], ready: false });
  s.seats = users
    .slice(0, 4)
    .map((u) => ({ id: u.id, nickname: u.nickname, ready: false }));
  dealRound(s);
  s.deadline = Date.now() + 60000;
  const roomId = randomUUID();
  db.prepare(
    "INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)",
  ).run(
    roomId,
    users[0].id,
    "guandan",
    s.phase,
    JSON.stringify(s),
    Date.now(),
    Date.now(),
  );
  assert.equal(
    (
      await req("admin/users/" + users[0].id, admin, "PATCH", {
        action: "ban",
        reason: "重启持久化验证：允许完成当前整场掼蛋",
      })
    ).data.user.account_status,
    "restricted",
  );
  writeFileSync(file, JSON.stringify({ admin, users, roomId }), {
    mode: 0o600,
  });
  console.log("Prepared independent restart and browser fixtures.");
} else if (process.argv[2] === "verify") {
  const { admin, users, roomId } = JSON.parse(readFileSync(file, "utf8"));
  const list = (await req("admin/users?status=suspicious", admin)).data;
  assert.equal(list.total, 5);
  assert.equal(list.items.length, 5);
  const member = (await req("auth/me", users[0])).data.user;
  assert.equal(member.account_status, "restricted");
  assert.equal(member.restricted_room_id, roomId);
  assert.equal((await req("games/" + roomId, users[0])).data.game, "guandan");
  await req("garden", users[0], "GET", undefined, undefined, 403);
  const audit = (await req("admin/users/" + users[0].id + "/audit", admin))
    .data;
  assert.equal(audit.total, 1);
  assert.equal(
    db
      .prepare("SELECT COUNT(*) count FROM registration_alerts WHERE ip=?")
      .get("198.51.100.21")!.count,
    1,
  );
  console.log(
    "PASS: persisted registration alerts, audit, session and full-match restriction after actual service restart.",
  );
} else throw new Error("Usage: test-accounts-persistence.mts prepare|verify");
