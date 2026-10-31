import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { pbkdf2Sync, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { coopQueries as q } from "../../lib/garden/cooperative-queries.ts";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5212/melon",
  directory = resolve(process.env.MELON_DATA_DIR || "");
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname) &&
    directory.includes("cooperative-garden-qa"),
  "isolated cooperative-garden-qa loopback required",
);
const db = new DatabaseSync(join(directory, "melon.sqlite"));
db.exec("PRAGMA foreign_keys=ON;PRAGMA busy_timeout=10000");
const checkpoint = join(directory, "cooperative-restart.json"),
  password = "Cooperative_Qa_2026",
  tag = "cq" + Date.now();
type Client = { id: string; username: string; cookie: string };
let clients: Client[] = [],
  gardens: string[] = [],
  checks = 0;
const check = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks++;
};
async function request(
  path: string,
  method = "GET",
  body?: object,
  client?: Client,
  status = 200,
  origin = new URL(base).origin,
) {
  const response = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(client ? { Cookie: client.cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await response.json();
  assert.equal(
    response.status,
    status,
    method + " " + path + ": " + JSON.stringify(data),
  );
  checks++;
  check(
    response.headers.get("cache-control") === "no-store",
    "never cache cooperative state",
  );
  return { data, response };
}
async function create(i: number, name = tag + "瓜田") {
  const id = randomUUID();
  gardens.push(id);
  const r = await request(
    "garden/coops",
    "POST",
    { name, intro: "虚构接口测试", requestId: id },
    clients[i],
    201,
  );
  return r.data.garden.id as string;
}
const action = (g: string, a: string, i: number, status = 200) =>
  request("garden/coops/" + g + "/" + a, "POST", {}, clients[i], status);
const detail = (g: string) => request("garden/coops/" + g);
function cleanup() {
  for (const g of gardens) {
    db.prepare("DELETE FROM coop_memories WHERE coop_id=?").run(g);
    db.prepare("DELETE FROM coop_waters WHERE coop_id=?").run(g);
    db.prepare("DELETE FROM coop_rounds WHERE coop_id=?").run(g);
    db.prepare("DELETE FROM coop_members WHERE coop_id=?").run(g);
    db.prepare("DELETE FROM coop_gardens WHERE id=?").run(g);
  }
  for (const c of clients) {
    db.prepare("DELETE FROM garden_check_ins WHERE user_id=?").run(c.id);
    db.prepare("DELETE FROM sessions WHERE user_id=?").run(c.id);
    db.prepare("DELETE FROM users WHERE id=?").run(c.id);
  }
  try {
    unlinkSync(checkpoint);
  } catch {}
}
try {
  if (process.argv.includes("--after-restart")) {
    const saved = JSON.parse(readFileSync(checkpoint, "utf8"));
    clients = saved.clients;
    gardens = saved.gardens;
    const state = (await detail(saved.ripe)).data;
    check(
      state.garden.growth === 35 && state.garden.harvestCount === 1,
      "shared harvest persists",
    );
    const me = (await request("garden/coops/me", "GET", undefined, clients[24]))
      .data;
    check(
      me.memories.some((m: any) => m.coopId === saved.ripe),
      "former contributor's memory survives restart",
    );
    check(
      (await request("garden", "GET", undefined, clients[0])).data.totalDays ===
        1,
      "personal check-in unchanged after restart",
    );
    check(
      db
        .prepare("SELECT COUNT(*) n FROM coop_memories WHERE coop_id=?")
        .get(saved.ripe)!.n === saved.awards,
      "awards not repeated on restart",
    );
    check(
      db
        .prepare("SELECT COUNT(*) n FROM coop_waters WHERE coop_id=?")
        .get(saved.ripe)!.n === 35,
      "waters persist without duplication",
    );
    cleanup();
    console.log(
      `PASS: ${checks} cooperative restart checks; only this test's fixtures removed.`,
    );
  } else {
    const salt = randomUUID(),
      hash =
        salt +
        ":" +
        pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
    for (let i = 0; i < 45; i++) {
      const c = { id: randomUUID(), username: tag + "_" + i, cookie: "" };
      clients.push(c);
      db.prepare(
        "INSERT INTO users(id,username,nickname,password,created_at) VALUES(?,?,?,?,?)",
      ).run(c.id, c.username, "虚构合种测试" + i, hash, Date.now());
      const login = await request("auth/login", "POST", {
        username: c.username,
        password,
      });
      c.cookie = login.response.headers.get("set-cookie")!.split(";")[0];
    }
    await request("garden/coops");
    await request("garden/coops/me", "GET", undefined, undefined, 401);
    await request("garden/coops", "POST", {}, undefined, 401);
    await request(
      "garden/coops",
      "POST",
      {},
      clients[0],
      403,
      "https://outside.invalid",
    );
    await request(
      "garden/coops",
      "POST",
      { name: "xx", requestId: randomUUID(), ownerId: clients[0].id },
      clients[0],
      400,
    );
    await request("garden/coops/missing", "GET", undefined, undefined, 404);
    await request("garden/coops/me/extra", "GET", undefined, clients[0], 404);
    await request("garden/coops?page=0", "GET", undefined, undefined, 400);
    const a = await create(0),
      b = await create(0),
      c = await create(0);
    await request(
      "garden/coops",
      "POST",
      { name: "第四块不应残留", requestId: randomUUID() },
      clients[0],
      409,
    );
    check(
      db
        .prepare(
          "SELECT COUNT(*) n FROM coop_gardens WHERE name='第四块不应残留'",
        )
        .get()!.n === 0,
      "failed creation rolls back garden, round and membership",
    );
    await request(
      "garden/coops",
      "POST",
      { name: "重复创建", requestId: a },
      clients[0],
    );
    check(
      (await request("garden/coops/me", "GET", undefined, clients[0])).data
        .gardens.length === 3,
      "creation retry is idempotent",
    );
    for (let i = 1; i < 9; i++) await action(a, "join", i);
    const seats = await Promise.all(
      [9, 10].map(async (i) => {
        const r = await fetch(base + "/api/garden/coops/" + a + "/join", {
          method: "POST",
          headers: {
            Origin: new URL(base).origin,
            "Content-Type": "application/json",
            Cookie: clients[i].cookie,
          },
          body: "{}",
        });
        return r.status;
      }),
    );
    check(
      seats.filter((s) => s === 200).length === 1 &&
        seats.filter((s) => s === 409).length === 1,
      "last seat cannot overfill",
    );
    check((await detail(a)).data.members.length === 10, "exactly ten members");
    await action(a, "join", 1);
    await action(a, "water", 20, 403);
    await request(
      "garden/coops/" + a + "/water",
      "POST",
      { day: "2000-01-01" },
      clients[0],
      400,
    );
    const waters = await Promise.all(
      Array.from({ length: 12 }, () => action(a, "water", 0)),
    );
    check(
      waters.filter((r) => !r.data.alreadyWatered).length === 1,
      "one success among same-day retries",
    );
    await action(b, "water", 0, 409);
    check(
      (await detail(b)).data.garden.growth === 0,
      "other garden did not receive water",
    );
    await request("garden/check-in", "POST", {}, clients[0]);
    check(
      (await request("garden", "GET", undefined, clients[0])).data.totalDays ===
        1,
      "personal check-in independent",
    );
    await action(a, "leave", 0);
    await request(
      "garden/coops/" + a,
      "PATCH",
      { name: "越权编辑" },
      clients[0],
      403,
    );
    check(
      (await detail(a)).data.garden.ownerId === clients[1].id,
      "earliest remaining member takes ownership",
    );
    await request(
      "garden/coops/" + a,
      "PATCH",
      { name: tag + "接管后的瓜田", intro: "修改成功" },
      clients[1],
    );
    db.prepare("UPDATE users SET account_status='banned' WHERE id=?").run(
      clients[1].id,
    );
    check(
      (await detail(a)).data.garden.ownerId === clients[2].id,
      "ban transfers ownership without removing progress",
    );
    await action(a, "water", 1, 401);
    await action(b, "water", 0, 409);
    const publicJSON = JSON.stringify((await detail(a)).data);
    for (const key of [
      '"email"',
      '"registration_ip"',
      '"password"',
      '"ban_reason"',
      '"account_status"',
    ])
      check(!publicJSON.includes(key), "public privacy: " + key);
    const ripe = await create(15, tag + "成熟测试");
    for (let i = 16; i < 25; i++) await action(ripe, "join", i);
    const today = (await detail(ripe)).data.today;
    const start = Date.parse(today + "T12:00:00+08:00") - 4 * 86400000;
    for (let n = 0; n < 34; n++) {
      const t = start + Math.floor(n / 10) * 86400000,
        day = new Date(t + 28800000).toISOString().slice(0, 10),
        u = clients[15 + (n % 10)].id;
      db.prepare(q.water).run(randomUUID(), day, u, day, t, ripe, u, day);
    }
    await action(ripe, "leave", 24);
    await action(ripe, "join", 25);
    const final = await Promise.all(
      [20, 25].map(async (i) => {
        const r = await fetch(base + "/api/garden/coops/" + ripe + "/water", {
          method: "POST",
          headers: {
            Origin: new URL(base).origin,
            "Content-Type": "application/json",
            Cookie: clients[i].cookie,
          },
          body: "{}",
        });
        return r.status;
      }),
    );
    check(
      final.filter((s) => s === 200).length === 1 &&
        final.filter((s) => s === 409).length === 1,
      "35th water settles only once",
    );
    const harvested = (await detail(ripe)).data;
    check(
      harvested.garden.growth === 35 && harvested.harvests.length === 1,
      "mature state and one shared harvest",
    );
    const awards = db
      .prepare("SELECT COUNT(*) n FROM coop_memories WHERE coop_id=?")
      .get(ripe)!.n;
    check(
      awards ===
        db
          .prepare(
            "SELECT COUNT(DISTINCT user_id) n FROM coop_waters WHERE coop_id=?",
          )
          .get(ripe)!.n,
      "exactly one memory per contributor",
    );
    check(
      (await request("garden/coops/me", "GET", undefined, clients[24])).data
        .memories.length === 1,
      "leaver retains memory",
    );
    await action(ripe, "water", 21, 409);
    check(
      db
        .prepare("SELECT COUNT(*) n FROM coop_waters WHERE user_id=? AND day=?")
        .get(clients[21].id, today)!.n === 0,
      "mature rejection does not consume daily eligibility",
    );
    const other = await create(21, tag + "成熟后别处浇水");
    await action(other, "water", 21);
    for (let i = 30; i < 41; i++)
      for (let n = 0; n < 2; n++) await create(i, tag + "分页" + i + "_" + n);
    const p1 = (await request("garden/coops?q=" + tag + "分页")).data,
      p2 = (await request("garden/coops?q=" + tag + "分页&page=2")).data;
    check(
      p1.items.length === 20 && p2.items.length === 2 && p1.total === 22,
      "search pagination",
    );
    check(
      (await request("garden/coops?q=no-such-" + tag)).data.total === 0,
      "no search results",
    );
    const percent = await create(41, "100%" + tag);
    check(
      (await request("garden/coops?q=%25")).data.items.some(
        (g: any) => g.id === percent,
      ),
      "literal percent search",
    );
    const history = await create(42, tag + "纪念分页"),
      historyStart = Date.parse(today + "T12:00:00+08:00") - 740 * 86400000;
    for (let n = 0; n < 735; n++) {
      const t = historyStart + n * 86400000,
        day = new Date(t + 28800000).toISOString().slice(0, 10),
        u = clients[42].id;
      db.prepare(q.water).run(randomUUID(), day, u, day, t, history, u, day);
    }
    const memories1 = (
        await request("garden/coops/me", "GET", undefined, clients[42])
      ).data,
      memories2 = (
        await request(
          "garden/coops/me?page=2&user_id=" + clients[42].id,
          "GET",
          undefined,
          clients[42],
        )
      ).data;
    check(
      memories1.total === 21 &&
        memories1.memories.length === 20 &&
        memories2.memories.length === 1,
      "private memory pagination",
    );
    check(
      (
        await request(
          "garden/coops/me?user_id=" + clients[42].id,
          "GET",
          undefined,
          clients[43],
        )
      ).data.total === 0,
      "account isolation",
    );
    check(
      (await request("garden/coops/" + history + "?page=2")).data.harvests
        .length === 1,
      "public harvest pagination",
    );
    check(
      (await detail(a)).data.garden.growth === 1,
      "all account transitions preserved growth",
    );
    writeFileSync(
      checkpoint,
      JSON.stringify({ clients, gardens, ripe, awards }),
      { mode: 0o600 },
    );
    console.log(
      `PASS: ${checks} cooperative HTTP checks; restart server and run --after-restart to verify persistence and clean fixtures.`,
    );
  }
} catch (e) {
  cleanup();
  throw e;
} finally {
  db.close();
}
