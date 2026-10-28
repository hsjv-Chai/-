import {testFetch as fetch} from "../helpers/verified-registration.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { openConnection } from "../../lib/node-storage.mjs";
import {
  createState,
  dealRound,
  type GameState,
} from "../../lib/games/engine.ts";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5188/melon";
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname),
  "Tests require loopback",
);
assert.ok(
  process.env.MELON_DATA_DIR?.includes("account-qa"),
  "Tests require isolated account-qa data",
);
const db = openConnection(),
  tag = "aq" + Date.now(),
  password = "AccountQa_12345678";
let checks = 0,
  serial = 0;
type Client = {
  id: string;
  username: string;
  nickname: string;
  cookie: string;
};
const clients: Client[] = [],
  roomIds: string[] = [];
const check = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks++;
};
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  client?: Client,
  status = 200,
  headers: Record<string, string> = {},
) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: new URL(base).origin,
      "Content-Type": "application/json",
      ...(client ? { Cookie: client.cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  check(
    r.headers.get("cache-control")?.includes("no-store"),
    "personal APIs never cache",
  );
  return { data, response: r };
}
async function register(ip?: string, extra: Record<string, string> = {}) {
  const username = tag + "_" + serial++,
    nickname = "测试瓜友" + serial;
  const { response } = await request(
    "auth/register",
    "POST",
    { username, nickname, password },
    undefined,
    200,
    { "X-Forwarded-For": ip || "unknown", ...extra },
  );
  const client = {
    id: "",
    username,
    nickname,
    cookie: response.headers.get("set-cookie")!.split(";")[0],
  };
  client.id = (await request("auth/me", "GET", undefined, client)).data.user.id;
  clients.push(client);
  return client;
}
const stateOf = (id: string) =>
  JSON.parse(
    db.prepare("SELECT state FROM game_rooms WHERE id=?").get(id)!
      .state as string,
  ) as GameState;
function saveState(id: string, s: GameState) {
  db.prepare(
    "UPDATE game_rooms SET state=?,phase=?,version=version+1,updated_at=? WHERE id=?",
  ).run(JSON.stringify(s), s.phase, Date.now(), id);
}
function game(game: "doudizhu" | "guandan", people: Client[]) {
  const s = createState(game, { ...people[0], ready: false });
  s.seats = people.map((p) => ({
    id: p.id,
    nickname: p.nickname,
    ready: false,
  }));
  dealRound(s);
  s.deadline = Date.now() + 60000;
  const id = randomUUID();
  roomIds.push(id);
  db.prepare(
    "INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)",
  ).run(
    id,
    people[0].id,
    game,
    s.phase,
    JSON.stringify(s),
    Date.now(),
    Date.now(),
  );
  return id;
}
async function act(
  id: string,
  client: Client,
  type: string,
  extra: object = {},
  status = 200,
) {
  const version = db
    .prepare("SELECT version FROM game_rooms WHERE id=?")
    .get(id)!.version;
  return request(
    "games/" + id,
    "POST",
    { type, version, ...extra },
    client,
    status,
  );
}
let admin: Client;
async function ban(c: Client) {
  return (
    await request(
      "admin/users/" + c.id,
      "PATCH",
      { action: "ban", reason: "隔离测试封禁" },
      admin,
    )
  ).data.user;
}
async function unban(c: Client) {
  return request(
    "admin/users/" + c.id,
    "PATCH",
    { action: "unban", reason: "隔离测试解封" },
    admin,
  );
}
async function login(c: Client, status = 200) {
  const { response } = await request(
    "auth/login",
    "POST",
    { username: c.username, password },
    undefined,
    status,
  );
  if (status === 200)
    c.cookie = response.headers.get("set-cookie")!.split(";")[0];
}
try {
  admin = await register();
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(admin.id);
  const a = await register(),
    b = await register(),
    c = await register(),
    d = await register();
  await request("admin/users", "GET", undefined, undefined, 401);
  await request("admin/users", "GET", undefined, a, 403);
  await request(
    "admin/users/" + b.id,
    "PATCH",
    { action: "ban", reason: "越权" },
    a,
    403,
  );
  await request(
    "admin/users/" + admin.id,
    "PATCH",
    { action: "ban", reason: "自我封禁" },
    admin,
    403,
  );
  const anotherAdmin = await register();
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(anotherAdmin.id);
  await request(
    "admin/users/" + anotherAdmin.id,
    "PATCH",
    { action: "ban", reason: "封禁管理员" },
    admin,
    403,
  );
  await request(
    "admin/users/" + a.id,
    "PATCH",
    { action: "ban", reason: " " },
    admin,
    400,
  );
  await request(
    "admin/users/" + a.id,
    "PATCH",
    { action: "ban", reason: "测试", role: "admin" },
    admin,
    400,
  );
  await request(
    "admin/users/" + randomUUID(),
    "PATCH",
    { action: "ban", reason: "测试" },
    admin,
    404,
  );
  await request(
    "admin/users/" + a.id,
    "PATCH",
    { action: "ban", reason: "跨站" },
    admin,
    403,
    { Origin: "https://evil.example" },
  );
  for (let i = 0; i < 4; i++) await register("192.0.2.10");
  let list = (
    await request("admin/users?status=suspicious", "GET", undefined, admin)
  ).data;
  check(list.total === 0, "four registrations do not flag");
  const fifth = await register("192.0.2.10");
  list = (
    await request("admin/users?status=suspicious", "GET", undefined, admin)
  ).data;
  check(list.total === 5, "fifth marks all five");
  const firstAlert = list.items[0].alert_id;
  const sixth = await register("::ffff:192.0.2.10");
  list = (
    await request("admin/users?alert=" + firstAlert, "GET", undefined, admin)
  ).data;
  check(
    list.total === 5 && list.registrationAlert.account_count === 5,
    "immutable event membership",
  );
  check(
    (await request("admin/users/" + sixth.id, "GET", undefined, admin)).data
      .user.registration_ip === "192.0.2.10",
    "mapped IPv4 shares identity",
  );
  const concurrent = await Promise.all(
    Array.from({ length: 7 }, () => register("198.51.100.11")),
  );
  check(
    concurrent.every((x) =>
      db
        .prepare("SELECT 1 FROM registration_alert_users WHERE user_id=?")
        .get(x.id),
    ),
    "concurrent registrations mark all affected users",
  );
  const spoof = await register(undefined, {
    "CF-Connecting-IP": "192.0.2.10",
    "X-Real-IP": "192.0.2.10",
  });
  const chain = await register("192.0.2.10, 127.0.0.1");
  check(
    db.prepare("SELECT registration_ip FROM users WHERE id=?").get(spoof.id)!
      .registration_ip === null,
    "unselected spoofed headers ignored",
  );
  check(
    db.prepare("SELECT registration_ip FROM users WHERE id=?").get(chain.id)!
      .registration_ip === null,
    "chain not accepted",
  );
  check(
    !db
      .prepare("SELECT 1 FROM registration_alert_users WHERE user_id=?")
      .get(spoof.id),
    "unknown IP not grouped",
  );
  const old = await register("203.0.113.12");
  db.prepare("UPDATE users SET created_at=? WHERE id=?").run(
    Date.now() - 601000,
    old.id,
  );
  const recent = await Promise.all(
    Array.from({ length: 4 }, () => register("203.0.113.12")),
  );
  check(
    !db
      .prepare("SELECT 1 FROM registration_alert_users WHERE user_id=?")
      .get(old.id),
    "outside rolling window excluded",
  );
  check(
    recent.every(
      (x) =>
        !db
          .prepare("SELECT 1 FROM registration_alert_users WHERE user_id=?")
          .get(x.id),
    ),
    "old registration does not meet threshold",
  );
  await register("203.0.113.12");
  check(
    recent.every((x) =>
      db
        .prepare("SELECT 1 FROM registration_alert_users WHERE user_id=?")
        .get(x.id),
    ),
    "inside window marked",
  );
  // Persisted flags outlive the ten-minute window.
  db.prepare(
    "UPDATE users SET created_at=created_at-3600000 WHERE registration_ip=?",
  ).run("192.0.2.10");
  check(
    (await request("admin/users/" + fifth.id, "GET", undefined, admin)).data
      .user.suspicious_at,
    "historical flags retained",
  );
  list = (await request("admin/users?q=" + tag, "GET", undefined, admin)).data;
  check(list.items.length === 20, "page size is 20");
  const next = (
    await request("admin/users?q=" + tag + "&page=2", "GET", undefined, admin)
  ).data;
  check(
    next.items.length > 0 &&
      !next.items.some((x: any) => list.items.some((y: any) => x.id === y.id)),
    "pagination distinct",
  );
  check(
    (
      await request(
        "admin/users?q=" + encodeURIComponent(a.username),
        "GET",
        undefined,
        admin,
      )
    ).data.items.some((x: any) => x.id === a.id),
    "username substring search",
  );
  check(
    (
      await request(
        "admin/users?q=" + encodeURIComponent(a.nickname),
        "GET",
        undefined,
        admin,
      )
    ).data.items.some((x: any) => x.id === a.id),
    "nickname search",
  );
  check(
    (await request("admin/users?q=%25", "GET", undefined, admin)).data.total ===
      0,
    "search wildcard escaped",
  );
  await request("admin/users?page=0", "GET", undefined, admin, 400);
  await request("admin/users?status=invalid", "GET", undefined, admin, 400);
  const post = (
    await request(
      "posts",
      "POST",
      {
        title: "账号验证话题",
        body: "账号验证的帖子正文",
        category_id: "hot",
        images: [],
      },
      a,
      201,
    )
  ).data;
  const imageForm = new FormData();
  imageForm.append(
    "file",
    new Blob(
      [readFileSync(new URL("../fixtures/image.png", import.meta.url))],
      { type: "image/png" },
    ),
    "test.png",
  );
  const upload = await fetch(base + "/api/uploads", {
    method: "POST",
    headers: { Cookie: a.cookie, Origin: new URL(base).origin },
    body: imageForm,
  });
  assert.equal(upload.status, 201);
  checks++;
  const image: any = await upload.json();
  await request(
    "posts/" + post.id,
    "PATCH",
    {
      title: "账号验证话题",
      body: "账号验证的帖子正文",
      category_id: "hot",
      images: [image.id],
    },
    a,
  );
  await request("garden/check-in", "POST", {}, a);
  check(
    (await ban(a)).account_status === "banned",
    "idle user immediately banned",
  );
  await login(a, 403);
  check(
    (await request("auth/me", "GET", undefined, a)).data.user === null,
    "old session revoked",
  );
  await request(
    "posts",
    "POST",
    { title: "禁止发布", body: "不应该发布成功", category_id: "hot" },
    a,
    401,
  );
  check(
    (await request("posts/" + post.id, "GET")).data.post.title ===
      "账号验证话题",
    "existing post retained",
  );
  const publicProfile = (await request("users/" + a.id, "GET")).data;
  check(
    !JSON.stringify(publicProfile).includes("registration_ip") &&
      !JSON.stringify(publicProfile).includes("ban_reason"),
    "public profile excludes private metadata",
  );
  await unban(a);
  await request("garden", "GET", undefined, a, 401);
  await login(a);
  check(
    (await request("garden", "GET", undefined, a)).data.totalDays === 1,
    "check-in retained after unban",
  );
  const audit = (
    await request("admin/users/" + a.id + "/audit", "GET", undefined, admin)
  ).data;
  check(
    audit.total === 2 && audit.items[0].actor_username === admin.username,
    "audit contains actor and both operations",
  );
  const ddz = game("doudizhu", [a, b, c]);
  check(
    (await ban(b)).account_status === "restricted",
    "active game defers ban",
  );
  await login(b, 403);
  await request(
    "posts/" + post.id + "/replies",
    "POST",
    { body: "受限回复" },
    b,
    403,
  );
  await request("posts/" + post.id + "/like", "POST", {}, b, 403);
  await request("posts/" + post.id + "/like", "DELETE", undefined, b, 403);
  await request("garden/check-in", "POST", {}, b, 403);
  await request("games", "POST", { game: "doudizhu" }, b, 403);
  await request("games", "GET", undefined, b, 403);
  await request("games/" + randomUUID(), "GET", undefined, b, 403);
  await act(ddz, b, "join", {}, 403);
  await request("games/" + ddz, "GET", undefined, b);
  check(
    (await request("auth/me", "GET", undefined, b)).data.user
      .restricted_room_id === ddz,
    "only assigned room granted",
  );
  // An ordinary player settles the hand; the restricted player still collects the public result.
  let s = stateOf(ddz);
  s.phase = "playing";
  s.landlord = 0;
  s.turn = 0;
  s.last = null;
  s.finish = [];
  s.hands[0] = [s.hands[0][0]];
  saveState(ddz, s);
  const final = (await act(ddz, a, "play", { cards: [s.hands[0][0].id] })).data;
  check(
    final.phase === "finished" && final.revealedHands.length === 2,
    "landlord settlement retains remaining cards",
  );
  const receipt = (await request("games/" + ddz, "GET", undefined, b)).data;
  check(
    receipt.accountEnded && receipt.revealedHands.length === 2,
    "revoked participant can collect final result only",
  );
  await act(ddz, b, "rematch", {}, 401);
  await act(ddz, a, "rematch", {}, 403);
  await request("garden", "GET", undefined, b, 401);
  db.prepare("UPDATE game_result_receipts SET expires=0 WHERE user_id=?").run(
    b.id,
  );
  await request("games/" + ddz, "GET", undefined, b, 401);
  await act(ddz, a, "leave");
  await act(ddz, c, "leave");
  await unban(b);
  await login(b);
  await act(ddz, b, "leave");
  const gd = game("guandan", [a, b, c, d]);
  await ban(b);
  s = stateOf(gd);
  s.phase = "roundEnd";
  s.finish = [0, 1, 2, 3];
  s.seats.forEach((p) => {
    if (p) p.ready = false;
  });
  saveState(gd, s);
  await request("games/" + gd, "GET", undefined, b);
  for (const p of [a, b, c, d]) await act(gd, p, "ready");
  check(
    ["tribute", "playing"].includes(stateOf(gd).phase),
    "restricted Guandan user starts next hand in same match",
  );
  check(
    db.prepare("SELECT account_status FROM users WHERE id=?").get(b.id)!
      .account_status === "restricted",
    "hand boundary does not finish full-match grace",
  );
  s = stateOf(gd);
  // Exercise grace permissions through tribute and return, if not resisted.
  for (let i = 0; i < 5 && ["tribute", "return"].includes(s.phase); i++) {
    const view = (
      await request("games/" + gd, "GET", undefined, [a, b, c, d][s.turn])
    ).data;
    await act(gd, [a, b, c, d][s.turn], "exchange", {
      cards: [view.exchangeAllowed[0]],
    });
    s = stateOf(gd);
  }
  s.phase = "playing";
  s.level = 14;
  s.levels = [14, 14];
  s.activeTeam = 0;
  s.finish = [0, 1];
  s.turn = 2;
  s.last = null;
  s.hands[0] = [];
  s.hands[1] = [];
  s.hands[2] = [s.hands[2][0]];
  saveState(gd, s);
  check(
    (await act(gd, c, "play", { cards: [s.hands[2][0].id] })).data.phase ===
      "finished",
    "Guandan match completes at A",
  );
  check(
    (await request("games/" + gd, "GET", undefined, b)).data.accountEnded,
    "Guandan grace expires only after match",
  );
  await unban(b);
  await login(b);
  // Grace can be cancelled without losing the original session.
  const cancel = game("doudizhu", [b, c, d]);
  await ban(b);
  await unban(b);
  check(
    (await request("auth/me", "GET", undefined, b)).data.user.account_status ===
      "active",
    "unban cancels pending restriction",
  );
  await ban(b);
  await act(cancel, b, "leave");
  check(
    (await request("auth/me", "GET", undefined, b)).data.user === null,
    "leaving finalizes pending ban",
  );
  await unban(b);
  await login(b);
  const expired = game("doudizhu", [b, c, d]);
  await ban(b);
  db.prepare("UPDATE game_rooms SET updated_at=? WHERE id=?").run(
    Date.now() - 8 * 86400000,
    expired,
  );
  check(
    (await request("auth/me", "GET", undefined, b)).data.user === null,
    "expired room finalizes restriction",
  );
  // DB guards reject a write that passed an earlier identity check before a ban.
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO garden_check_ins(user_id,day,created_at) VALUES(?,?,?)",
        )
        .run(b.id, "2099-01-01", Date.now()),
    /MELON_ACCOUNT_RESTRICTED/,
  );
  checks++;
  // Concurrent moderation must record one successful state change, never two contradictory ones.
  const race = await Promise.all(
    [1, 2].map(() =>
      fetch(base + "/api/admin/users/" + d.id, {
        method: "PATCH",
        headers: {
          Cookie: admin.cookie,
          Origin: new URL(base).origin,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "ban", reason: "并发验证" }),
      }),
    ),
  );
  check(
    race.filter((x) => x.status === 200).length === 1 &&
      race.filter((x) => x.status === 409).length === 1,
    "concurrent bans serialize",
  );
  check(
    db
      .prepare(
        "SELECT COUNT(*) count FROM account_audit WHERE user_id=? AND action='ban'",
      )
      .get(d.id)!.count === 1,
    "one successful audit",
  );
  console.log(`PASS: ${checks} account-management API checks`);
} finally {
  const ids = clients.map((c) => c.id);
  if (ids.length) {
    const q = ids.map(() => "?").join(",");
    db.prepare(
      `UPDATE users SET account_status='active' WHERE id IN (${q})`,
    ).run(...ids);
    for (const t of [
      "registration_alert_users",
      "account_audit",
      "game_result_receipts",
      "garden_check_ins",
      "sessions",
      "likes",
      "uploads",
      "replies",
      "posts",
    ]) {
      const column = t === "registration_alert_users" ? "user_id" : "user_id";
      db.prepare(`DELETE FROM ${t} WHERE ${column} IN (${q})`).run(...ids);
    }
    db.prepare(
      `DELETE FROM registration_alerts WHERE NOT EXISTS(SELECT 1 FROM registration_alert_users WHERE alert_id=registration_alerts.id)`,
    ).run();
    for (const id of roomIds)
      db.prepare("DELETE FROM game_rooms WHERE id=?").run(id);
    db.prepare(`DELETE FROM auth_attempts WHERE key LIKE ?`).run(tag + "%");
    db.prepare(`DELETE FROM users WHERE id IN (${q})`).run(...ids);
  }
}
