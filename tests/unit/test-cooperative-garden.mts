import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { coopQueries as q } from "../../lib/garden/cooperative-queries.ts";
import { coopClock, coopStage } from "../../lib/garden/cooperative-model.ts";
const root = new URL("../../", import.meta.url);
function database(file = ":memory:") {
  const db = new DatabaseSync(file);
  db.exec(
    "PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=10000",
  );
  for (const { tag } of JSON.parse(
    readFileSync(new URL("drizzle/meta/_journal.json", root), "utf8"),
  ).entries)
    db.exec(readFileSync(new URL(`drizzle/${tag}.sql`, root), "utf8"));
  for (let i = 0; i < 45; i++)
    db.prepare(
      "INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)",
    ).run("u" + i, "coop_unit_" + i, "虚构瓜友" + i, "unit-only", "member", i);
  return db;
}
function create(db: DatabaseSync, g: string, u = "u0", time = 1) {
  db.exec("BEGIN");
  try {
    db.prepare(q.create).run(g, "测试瓜田", "虚构测试", u, time, time);
    db.prepare(q.firstRound).run(time, g, u);
    db.prepare(q.createMember).run(randomUUID(), u, time, g, u, u);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
function member(db: DatabaseSync, g: string, u: string, time = 2) {
  return db.prepare(q.join).run(randomUUID(), u, time, g, u);
}
function water(
  db: DatabaseSync,
  g: string,
  u: string,
  day: string,
  time = Date.parse(day + "T12:00:00+08:00"),
) {
  return db.prepare(q.water).run(randomUUID(), day, u, day, time, g, u, day);
}
function round(db: DatabaseSync, g: string) {
  return db
    .prepare(
      "SELECT r.* FROM coop_rounds r JOIN coop_gardens c ON c.id=r.coop_id AND c.current_round=r.number WHERE c.id=?",
    )
    .get(g)!;
}
function fixtureNearMaturity(db: DatabaseSync, g = "g") {
  create(db, g);
  for (let i = 1; i < 10; i++) member(db, g, "u" + i, i + 2);
  let n = 0;
  for (let day = 1; day <= 4; day++)
    for (let i = 0; i < 10 && n < 34; i++, n++)
      water(db, g, "u" + i, `2026-09-${String(day).padStart(2, "0")}`);
}
test("growth has six growing stages; only 35 is mature, Beijing reset", () => {
  assert.equal(coopStage(0), 0);
  assert.equal(coopStage(1), 1);
  assert.equal(coopStage(34), 6);
  assert.equal(coopStage(35), 7);
  for (let i = 1; i < 35; i++) assert.ok(coopStage(i) < 7);
  const t = Date.parse("2026-12-31T15:59:59.999Z");
  assert.equal(coopClock(t).today, "2026-12-31");
  assert.equal(coopClock(t).nextResetAt, t + 1);
  assert.equal(coopClock(t + 1).today, "2027-01-01");
});
test("additive migration preserves legacy personal check-ins and harvests", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  try {
    const entries = JSON.parse(
      readFileSync(new URL("drizzle/meta/_journal.json", root), "utf8"),
    ).entries;
    for (const { tag } of entries.slice(0, -1))
      db.exec(readFileSync(new URL(`drizzle/${tag}.sql`, root), "utf8"));
    db.prepare(
      "INSERT INTO users(id,username,nickname,password,created_at) VALUES('legacy','legacy','历史瓜友','unused',1)",
    ).run();
    for (let i = 1; i <= 7; i++)
      db.prepare("INSERT INTO garden_check_ins VALUES(?,?,?)").run(
        "legacy",
        "2026-10-0" + i,
        i,
      );
    const before = JSON.stringify(
      db.prepare("SELECT * FROM garden_check_ins ORDER BY day").all(),
    );
    db.exec(
      readFileSync(new URL(`drizzle/${entries.at(-1).tag}.sql`, root), "utf8"),
    );
    assert.equal(
      JSON.stringify(
        db.prepare("SELECT * FROM garden_check_ins ORDER BY day").all(),
      ),
      before,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    create(db, "g", "legacy");
    water(
      db,
      "g",
      "legacy",
      "2026-12-31",
      Date.parse("2026-12-31T15:59:59.999Z"),
    );
    water(
      db,
      "g",
      "legacy",
      "2027-01-01",
      Date.parse("2026-12-31T16:00:00.000Z"),
    );
    assert.equal(round(db, "g").growth, 2);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM garden_check_ins").get()!.n,
      7,
    );
  } finally {
    db.close();
  }
});
test("ten members, three memberships, duplicate joins and creation rollback", () => {
  const db = database();
  try {
    create(db, "g");
    for (let i = 1; i < 10; i++) member(db, "g", "u" + i);
    assert.throws(() => member(db, "g", "u10"), /COOP_FULL/);
    assert.equal(Number(member(db, "g", "u1").changes), 0);
    create(db, "g2");
    create(db, "g3");
    assert.throws(() => create(db, "g4"), /COOP_MEMBERSHIP_LIMIT/);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM coop_gardens WHERE id='g4'").get()!.n,
      0,
    );
    db.prepare(q.leave).run(3, "g", "u1");
    member(db, "g", "u10");
    assert.throws(() => member(db, "g", "u1"), /COOP_FULL/);
  } finally {
    db.close();
  }
});
test("daily water is global, retry-safe and independent of personal check-in", () => {
  const db = database();
  try {
    create(db, "a");
    create(db, "b");
    assert.equal(Number(water(db, "a", "u0", "2026-10-01").changes), 1);
    assert.equal(Number(water(db, "a", "u0", "2026-10-01").changes), 0);
    assert.equal(Number(water(db, "b", "u0", "2026-10-01").changes), 0);
    db.prepare(q.leave).run(4, "a", "u0");
    member(db, "a", "u0", 5);
    assert.equal(Number(water(db, "a", "u0", "2026-10-01").changes), 0);
    db.prepare("INSERT INTO garden_check_ins VALUES(?,?,?)").run(
      "u0",
      "2026-10-01",
      1,
    );
    assert.equal(round(db, "a").growth, 1);
    assert.throws(() => water(db, "a", "u2", "2026-10-01"), /COOP_NOT_MEMBER/);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM coop_waters WHERE user_id='u2'").get()!
        .n,
      0,
    );
  } finally {
    db.close();
  }
});
test("35 waters settle once; all contributors including leavers get one memory", () => {
  const db = database();
  try {
    create(db, "g");
    member(db, "g", "u1");
    water(db, "g", "u1", "2026-09-01");
    db.prepare(q.leave).run(3, "g", "u1");
    for (let i = 1; i <= 31; i++)
      water(db, "g", "u0", `2026-10-${String(i).padStart(2, "0")}`);
    for (let i = 1; i <= 3; i++) water(db, "g", "u0", `2026-11-0${i}`, 100 + i);
    assert.equal(round(db, "g").growth, 35);
    assert.equal(round(db, "g").matured_day, "2026-11-03");
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM coop_memories").get()!.n,
      2,
    );
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM coop_memories WHERE user_id='u1'")
        .get()!.n,
      1,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM garden_check_ins").get()!.n,
      0,
    );
    member(db, "g", "u2");
    assert.throws(() => water(db, "g", "u2", "2026-11-03"), /COOP_MATURED/);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM coop_waters WHERE user_id='u2'").get()!
        .n,
      0,
    );
    water(db, "g", "u2", "2026-11-04");
    assert.equal(round(db, "g").number, 2);
    assert.equal(round(db, "g").growth, 1);
    assert.equal(
      db.prepare("SELECT COUNT(*) n FROM coop_memories").get()!.n,
      2,
    );
  } finally {
    db.close();
  }
});
test("handoff on exit, ban or restriction; empty plots and unban never steal ownership", () => {
  const db = database();
  try {
    create(db, "g");
    member(db, "g", "u1", 2);
    member(db, "g", "u2", 3);
    db.prepare(
      "UPDATE users SET account_status='restricted' WHERE id='u0'",
    ).run();
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      "u1",
    );
    assert.throws(
      () => water(db, "g", "u0", "2026-10-01"),
      /MELON_ACCOUNT_RESTRICTED/,
    );
    db.prepare("UPDATE users SET account_status='active' WHERE id='u0'").run();
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      "u1",
    );
    assert.equal(
      Number(
        db.prepare(q.edit).run("试图越权", "", 4, "g", "u0", "u0", "u0")
          .changes,
      ),
      0,
    );
    db.prepare(q.leave).run(5, "g", "u1");
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      "u0",
    );
    db.prepare(q.leave).run(6, "g", "u0");
    db.prepare(q.leave).run(7, "g", "u2");
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      null,
    );
    member(db, "g", "u3", 8);
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      "u3",
    );
    db.prepare("UPDATE users SET account_status='banned' WHERE id='u3'").run();
    assert.equal(
      db.prepare("SELECT owner_id FROM coop_gardens WHERE id='g'").get()!
        .owner_id,
      null,
    );
    create(db, "other", "u4");
    assert.throws(() => member(db, "other", "u3"), /MELON_ACCOUNT_RESTRICTED/);
  } finally {
    db.close();
  }
});
type Operation = { query: string; values: (string | number)[] };
async function race(file: string, operations: Operation[]) {
  const signal = new SharedArrayBuffer(4),
    workers: Worker[] = [];
  const ready: Promise<void>[] = [];
  const results = operations.map(
    (op) =>
      new Promise<{ changes?: number; error?: string }>((resolve, reject) => {
        const worker = new Worker(
          new URL("../helpers/coop-race-worker.mts", import.meta.url),
          {
            workerData: { file, ...op, signal },
            execArgv: ["--experimental-strip-types"],
          },
        );
        workers.push(worker);
        ready.push(
          new Promise<void>((done, failed) => {
            worker.on("message", (v) => {
              if (v.ready) done();
              else resolve(v);
            });
            worker.on("error", failed);
          }),
        );
        worker.on("error", reject);
      }),
  );
  await Promise.all(ready);
  Atomics.store(new Int32Array(signal), 0, 1);
  Atomics.notify(new Int32Array(signal), 0, operations.length);
  const values = await Promise.all(results);
  await Promise.all(workers.map((w) => w.terminate()));
  return values;
}
test("separate SQLite connections race daily quota, last seat and the 35th water", async () => {
  const dir = mkdtempSync(join(tmpdir(), "melon-coop-qa-")),
    file = join(dir, "test.sqlite"),
    db = database(file);
  try {
    create(db, "a");
    create(db, "b");
    const waters = await race(
      file,
      Array.from({ length: 8 }, (_, i) => ({
        query: q.water,
        values: [
          randomUUID(),
          "2026-10-01",
          "u0",
          "2026-10-01",
          1,
          i % 2 ? "a" : "b",
          "u0",
          "2026-10-01",
        ],
      })),
    );
    assert.equal(
      waters.reduce((n, r) => n + (r.changes || 0), 0),
      1,
    );
    for (let i = 1; i < 9; i++) member(db, "a", "u" + i);
    const joins = await race(
      file,
      [9, 10].map((i) => ({
        query: q.join,
        values: [randomUUID(), "u" + i, i, "a", "u" + i],
      })),
    );
    assert.equal(
      joins.reduce((n, r) => n + (r.changes || 0), 0),
      1,
    );
    assert.equal(joins.filter((r) => r.error?.includes("COOP_FULL")).length, 1);
    for (let i = 1; i <= 4; i++) create(db, "membership" + i, "u" + (40 + i));
    member(db, "membership1", "u39");
    member(db, "membership2", "u39");
    const memberships = await race(
      file,
      [3, 4].map((i) => ({
        query: q.join,
        values: [randomUUID(), "u39", i, "membership" + i, "u39"],
      })),
    );
    assert.equal(
      memberships.reduce((n, r) => n + (r.changes || 0), 0),
      1,
    );
    assert.equal(
      memberships.filter((r) => r.error?.includes("COOP_MEMBERSHIP_LIMIT"))
        .length,
      1,
    );
    fixtureNearMaturity(db, "ripe");
    const ripe = await race(
      file,
      [4, 5].map((i) => ({
        query: q.water,
        values: [
          randomUUID(),
          "2026-09-04",
          "u" + i,
          "2026-09-04",
          100 + i,
          "ripe",
          "u" + i,
          "2026-09-04",
        ],
      })),
    );
    assert.equal(
      ripe.reduce((n, r) => n + (r.changes || 0), 0),
      1,
    );
    assert.equal(
      ripe.filter((r) => r.error?.includes("COOP_MATURED")).length,
      1,
    );
    assert.equal(round(db, "ripe").growth, 35);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM coop_memories WHERE coop_id='ripe'")
        .get()!.n,
      10,
    );
    const next = await race(
      file,
      [5, 6].map((i) => ({
        query: q.water,
        values: [
          randomUUID(),
          "2026-09-05",
          "u" + i,
          "2026-09-05",
          200 + i,
          "ripe",
          "u" + i,
          "2026-09-05",
        ],
      })),
    );
    assert.equal(
      next.reduce((n, r) => n + (r.changes || 0), 0),
      2,
    );
    assert.equal(round(db, "ripe").number, 2);
    assert.equal(round(db, "ripe").growth, 2);
    assert.equal(
      db
        .prepare("SELECT COUNT(*) n FROM coop_rounds WHERE coop_id='ripe'")
        .get()!.n,
      2,
    );
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
