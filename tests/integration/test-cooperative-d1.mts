import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { coopQueries as q } from "../../lib/garden/cooperative-queries.ts";

// Always local, always a new isolated persistence directory. No account or cloud resource is used.
const directory = resolve(".sites-runtime/cooperative-d1-qa-" + process.pid);
mkdirSync(directory, { recursive: true });
const config = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
assert.ok(
  config.d1_databases?.some((d: { binding: string }) => d.binding === "DB"),
  "build the Worker first",
);
let serial = 0,
  checks = 0;
const quote = (v: unknown) =>
  typeof v === "number"
    ? String(v)
    : "'" + String(v).replaceAll("'", "''") + "'";
function bind(query: string, ...values: unknown[]) {
  let i = 0;
  return query.replace(/\?/g, () => quote(values[i++]));
}
function execute(sql: string) {
  const file = join(directory, "query-" + ++serial + ".sql");
  writeFileSync(file, sql);
  const out = execFileSync(
    process.execPath,
    [
      "--import",
      "./scripts/sites-env.mjs",
      "./node_modules/wrangler/bin/wrangler.js",
      "d1",
      "execute",
      "DB",
      "--local",
      "--config",
      "dist/server/wrangler.json",
      "--persist-to",
      directory,
      "--file",
      file,
      "--json",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  return JSON.parse(out).flatMap(
    (v: { results: unknown[] }) => v.results || [],
  );
}
function expectFailure(sql: string, code: string) {
  try {
    execute(sql);
    assert.fail("Expected " + code);
  } catch (e) {
    const err = e as { stderr?: Buffer | string; stdout?: Buffer | string };
    const output = String(err.stderr) + String(err.stdout);
    assert.ok(output.includes(code), output);
    checks++;
  }
}
const create = (g: string, u: string, t = 1) =>
  bind(q.create, g, "虚构 D1 瓜田", "本地测试", u, t, t) +
  ";" +
  bind(q.firstRound, t, g, u) +
  ";" +
  bind(q.createMember, randomUUID(), u, t, g, u, u) +
  ";";
const member = (g: string, u: string, t = 2) =>
  bind(q.join, randomUUID(), u, t, g, u) + ";";
const water = (g: string, u: string, day: string) =>
  bind(
    q.water,
    randomUUID(),
    day,
    u,
    day,
    Date.parse(day + "T12:00:00+08:00"),
    g,
    u,
    day,
  ) + ";";
const migrations = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8"),
)
  .entries.map(({ tag }: { tag: string }) =>
    readFileSync("drizzle/" + tag + ".sql", "utf8"),
  )
  .join("\n");
let setup = migrations + "\n";
for (let i = 0; i < 16; i++)
  setup += `INSERT INTO users(id,username,nickname,password,created_at) VALUES('d${i}','coop_d1_${i}','虚构瓜友${i}','unused',1);\n`;
setup +=
  create("one", "d0") +
  create("two", "d0") +
  member("one", "d1", 2) +
  member("one", "d2", 3);
for (let n = 0; n < 34; n++) {
  const day = new Date(Date.UTC(2000, 0, 1 + n)).toISOString().slice(0, 10);
  setup += water("one", "d0", day);
}
setup +=
  bind(q.leave, 10, "one", "d0") +
  ";" +
  water("one", "d1", "2001-02-01") +
  water("two", "d1", "2001-02-01");
setup += create("full", "d3");
for (let i = 4; i <= 12; i++) setup += member("full", "d" + i);
for (let n = 0; n < 3; n++) setup += create("limit" + n, "d14");
execute(setup);
expectFailure(water("one", "d2", "2001-02-01"), "COOP_MATURED");
expectFailure(member("full", "d13"), "COOP_FULL");
expectFailure(member("two", "d14"), "COOP_MEMBERSHIP_LIMIT");
execute(
  water("one", "d2", "2001-02-02") +
    "UPDATE users SET account_status='banned' WHERE id='d1';",
);
expectFailure(water("one", "d1", "2001-02-03"), "MELON_ACCOUNT_RESTRICTED");
const [state] = execute(`SELECT c.current_round,c.owner_id,r.growth,
  (SELECT COUNT(*) FROM coop_memories WHERE coop_id='one') memories,
  (SELECT COUNT(*) FROM coop_memories WHERE coop_id='one' AND user_id='d0') leaver_memories,
  (SELECT growth FROM coop_rounds WHERE coop_id='two' AND number=1) other_growth,
  (SELECT COUNT(*) FROM coop_members WHERE coop_id='full' AND left_at IS NULL) members,
  (SELECT COUNT(*) FROM coop_waters WHERE user_id='d1' AND day='2001-02-01') daily,
  (SELECT COUNT(*) FROM coop_rounds WHERE coop_id='one') rounds
  FROM coop_gardens c JOIN coop_rounds r ON r.coop_id=c.id AND r.number=c.current_round WHERE c.id='one';`) as any[];
for (const [key, value] of Object.entries({
  current_round: 2,
  owner_id: "d2",
  growth: 1,
  memories: 2,
  leaver_memories: 1,
  other_growth: 0,
  members: 10,
  daily: 1,
  rounds: 2,
})) {
  assert.equal(state[key], value, key);
  checks++;
}
assert.deepEqual(execute("PRAGMA foreign_key_check;"), []);
checks++;
console.log(
  `PASS: ${checks} local D1/Worker SQL checks; no remote resources or mail used.`,
);
