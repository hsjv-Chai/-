// Explicit, repeatable LOCAL demo. Never runs at application startup.
import { openConnection, dataDir } from "../lib/node-storage.mjs";
import { coopQueries as q } from "../lib/garden/cooperative-queries.ts";
import { pbkdf2Sync, randomUUID } from "node:crypto";
const dir = dataDir(),
  origin = new URL(process.env.MELON_PUBLIC_ORIGIN || "http://127.0.0.1");
if (
  process.env.NODE_ENV === "production" ||
  !dir.includes("cooperative-garden-qa") ||
  !["127.0.0.1", "localhost"].includes(origin.hostname)
)
  throw new Error(
    "Only an isolated local cooperative-garden-qa directory is allowed",
  );
const db = openConnection();
db.exec("PRAGMA foreign_keys=ON");
const today = Date.parse(
  new Date(Date.now() + 28800000).toISOString().slice(0, 10) +
    "T12:00:00+08:00",
);
const password = "Local_Garden_Demo_2026",
  salt = "local-cooperative-demo",
  hash =
    salt +
    ":" +
    pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
const users = Array.from({ length: 10 }, (_, i) => "coop-demo-user-" + i),
  names = [
    "【虚构】阳台上的第一颗瓜",
    "【虚构】把平凡日子种成一颗甜甜的瓜",
    "【虚构】大家一起种的成熟西瓜",
  ];
db.exec("BEGIN IMMEDIATE");
try {
  for (let i = 0; i < 10; i++)
    db.prepare(
      "INSERT INTO users(id,username,nickname,password,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO NOTHING",
    ).run(
      users[i],
      "coop_demo_" + i,
      "虚构瓜友" + i,
      hash,
      today - 30 * 86400000,
    );
  for (let i = 0; i < 3; i++) {
    const g = "coop-demo-garden-" + i;
    for (const table of [
      "coop_memories",
      "coop_waters",
      "coop_rounds",
      "coop_members",
    ])
      db.prepare("DELETE FROM " + table + " WHERE coop_id=?").run(g);
    db.prepare("DELETE FROM coop_gardens WHERE id=?").run(g);
    const owner = users[i === 0 ? 0 : i === 1 ? 5 : 7],
      t = today - 30 * 86400000;
    db.prepare(q.create).run(
      g,
      names[i],
      i === 0
        ? "这是本地虚构演示。再浇一次水，就能见证大家的第一颗西瓜。"
        : i === 1
          ? "这是本地虚构演示。长一点的名字，也盛得下一群人的小期待。"
          : "这是本地虚构演示。成熟当天留住这一刻，明天再种下一颗。",
      owner,
      t,
      t,
    );
    db.prepare(q.firstRound).run(t, g, owner);
    db.prepare(q.createMember).run(randomUUID(), owner, t, g, owner, owner);
    const participants =
      i === 0
        ? users.slice(0, 5)
        : i === 1
          ? users.slice(5, 7)
          : users.slice(7, 10);
    for (const [j, u] of participants.entries())
      db.prepare(q.join).run(randomUUID(), u, t + j + 1, g, u);
    const amount = i === 0 ? 34 : i === 1 ? 0 : 35;
    for (let n = 0; n < amount; n++) {
      const u = participants[n % participants.length],
        days = i === 0 ? 7 - Math.floor(n / 5) : 11 - Math.floor(n / 3),
        time = today - days * 86400000 + (n % participants.length) * 60000;
      const day = new Date(time + 28800000).toISOString().slice(0, 10);
      db.prepare(q.water).run(randomUUID(), day, u, day, time, g, u, day);
    }
  }
  db.exec("COMMIT");
  console.log(
    "Local fictional cooperative gardens initialized. Demo login: coop_demo_0 / Local_Garden_Demo_2026. No email sent.",
  );
} catch (e) {
  db.exec("ROLLBACK");
  throw e;
}
