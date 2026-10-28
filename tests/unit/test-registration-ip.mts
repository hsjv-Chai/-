import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIp, registrationIp } from "../../lib/registration-ip.ts";
test("canonicalizes single IPv4 and IPv6 addresses without accepting forwarding chains", () => {
  for (const [input, output] of [
    ["192.0.2.5", "192.0.2.5"],
    ["::ffff:192.0.2.5", "192.0.2.5"],
    ["::ffff:c000:205", "192.0.2.5"],
    ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["::1", "::1"],
  ] as const)
    assert.equal(normalizeIp(input), output);
  for (const input of [
    null,
    "",
    " 192.0.2.1",
    "1.2.3.4, 5.6.7.8",
    "256.1.1.1",
    "192.000.2.1",
    "localhost",
    "1234",
    "::1%eth0",
    "[::1]",
    "1.2.3.4:80",
    "::zzz",
  ])
    assert.equal(normalizeIp(input), null, input ?? "null");
});
test("only reads the explicitly selected trusted edge header", () => {
  const previous = process.env.MELON_CLIENT_IP_SOURCE;
  try {
    const request = new Request("http://localhost", {
      headers: {
        "x-forwarded-for": "192.0.2.8",
        "cf-connecting-ip": "198.51.100.9",
        "x-real-ip": "203.0.113.10",
      },
    });
    delete process.env.MELON_CLIENT_IP_SOURCE;
    assert.equal(registrationIp(request), null);
    process.env.MELON_CLIENT_IP_SOURCE = "nginx";
    assert.equal(registrationIp(request), "192.0.2.8");
    process.env.MELON_CLIENT_IP_SOURCE = "cloudflare";
    assert.equal(registrationIp(request), "198.51.100.9");
    process.env.MELON_CLIENT_IP_SOURCE = "nginx";
    assert.equal(
      registrationIp(
        new Request("http://localhost", {
          headers: { "x-forwarded-for": "192.0.2.8, 127.0.0.1" },
        }),
      ),
      null,
    );
  } finally {
    if (previous === undefined) delete process.env.MELON_CLIENT_IP_SOURCE;
    else process.env.MELON_CLIENT_IP_SOURCE = previous;
  }
});

test("additive migration preserves existing accounts and guards writes made after a concurrent ban", async () => {
  const { DatabaseSync } = await import("node:sqlite"),
    { readFileSync } = await import("node:fs");
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  for (const tag of [
    "0000_amusing_wonder_man",
    "0001_oval_cardiac",
    "0002_narrow_blob",
  ])
    db.exec(
      readFileSync(
        new URL("../../drizzle/" + tag + ".sql", import.meta.url),
        "utf8",
      ),
    );
  db.prepare(
    "INSERT INTO users(id,username,nickname,password,created_at) VALUES(?,?,?,?,?)",
  ).run("old", "legacy", "历史用户", "hash", 1);
  db.exec(
    readFileSync(
      new URL("../../drizzle/0003_account_management.sql", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    {
      ...db
        .prepare(
          "SELECT account_status,registration_ip,account_version FROM users WHERE id=?",
        )
        .get("old"),
    },
    { account_status: "active", registration_ip: null, account_version: 0 },
  );
  db.prepare("INSERT INTO categories(id,name,description) VALUES(?,?,?)").run(
    "hot",
    "热点",
    "测试",
  );
  db.exec("UPDATE users SET account_status='banned' WHERE id='old'");
  assert.throws(
    () =>
      db
        .prepare(
          "INSERT INTO posts(id,user_id,category_id,title,body,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run("p", "old", "hot", "旧请求", "旧请求", 1, 1),
    /MELON_ACCOUNT_RESTRICTED/,
  );
  assert.throws(
    () =>
      db
        .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)")
        .run("s", "old", 9999999999999),
    /MELON_ACCOUNT_RESTRICTED/,
  );
  db.close();
});
