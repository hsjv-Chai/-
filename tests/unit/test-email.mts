import test, { beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { createHmac } from "node:crypto";
import { join, resolve } from "node:path";
import {
  normalizeEmail,
  codeDigest,
  randomCode,
  aliyunSignedBody,
  equalDigest,
} from "../../lib/email/model.ts";
import { issueEmailCode, registerVerified } from "../../lib/email/service.ts";
import {
  mailConfiguration,
  sendVerification,
  type VerificationMessage,
} from "../../lib/email/provider.ts";
import { openConnection } from "../../lib/node-storage.mjs";
const data = resolve(".sites-runtime/email-unit-qa-" + process.pid);
process.env.MELON_DATA_DIR = data;
process.env.MELON_MAIL_PROVIDER = "preview";
process.env.MELON_EMAIL_HMAC_SECRET = "Unit_Test_Only_Secret_32_bytes_000000";
process.env.MELON_PUBLIC_ORIGIN = "http://127.0.0.1";
process.env.MELON_CLIENT_IP_SOURCE = "nginx";
Object.assign(process.env, { NODE_ENV: "development" });
mkdirSync(data, { recursive: true });
const db = openConnection();
for (const { tag } of JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8"),
).entries)
  db.exec(readFileSync("drizzle/" + tag + ".sql", "utf8"));
let time = Date.UTC(2026, 9, 28, 4),
  serial = 0;
const realNow = Date.now;
Date.now = () => time;
db.function("julianday", (_value: string) => time / 86400000 + 2440587.5);
db.function("strftime", (_format: string, _value: string, _offset: string) =>
  new Date(time + 8 * 3600000).toISOString().slice(0, 10),
);
const messages = new Map<string, VerificationMessage>();
const capture = async (m: VerificationMessage) => {
  messages.set(m.challengeId, m);
};
const req = (ip = "192.0.2.1") =>
  new Request("http://127.0.0.1/api/auth/register", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
async function issue(
  email = "person@example.com",
  username = "user_" + serial++,
  ip = "192.0.2.1",
  sender = capture,
) {
  const response = await issueEmailCode(req(ip), { email, username }, sender);
  const info = (await response.json()) as any;
  return { ...info, ...messages.get(info.challengeId), email, username };
}
async function register(c: any, extra: object = {}) {
  return registerVerified(req(), {
    email: c.email,
    username: c.username,
    code: c.code,
    challengeId: c.challengeId,
    nickname: "测试瓜友",
    password: "EmailTest_123456",
    ...extra,
  });
}
async function rejectStatus(
  work: Promise<unknown>,
  status: number,
  pattern?: RegExp,
) {
  await assert.rejects(
    work,
    (e: any) => e.status === status && (!pattern || pattern.test(e.message)),
  );
}
beforeEach(() => {
  db.exec(
    "DELETE FROM sessions; DELETE FROM registration_alert_users; DELETE FROM registration_alerts; DELETE FROM users; DELETE FROM email_challenges; DELETE FROM email_quotas; DELETE FROM email_send_attempts;",
  );
  messages.clear();
  time = Date.UTC(2026, 9, 28, 4);
  serial = 0;
});
after(() => {
  Date.now = realNow;
  db.close();
  rmSync(data, { recursive: true, force: true });
});
test("normalization merges consumer Gmail aliases, preserves other providers and Workspace names", () => {
  for (const address of [
    " A.B+tag@googlemail.com ",
    "ab@gmail.com",
    "a.b@gmail.com",
  ])
    assert.equal(normalizeEmail(address).canonical, "ab@gmail.com");
  assert.equal(
    normalizeEmail(" A.B+tag@school.edu ").canonical,
    "a.b+tag@school.edu",
  );
  assert.equal(normalizeEmail("a.b@qq.com").canonical, "a.b@qq.com");
  for (const address of [
    "x",
    "a\r\n@b.com",
    "a@b.com,c@d.com",
    "a@localhost",
    "a..b@gmail.com",
    "<a@example.com>",
  ])
    assert.throws(() => normalizeEmail(address));
  for (let i = 0; i < 100; i++) assert.match(randomCode(), /^\d{6}$/);
});
test("HMAC and Aliyun RPC signatures match independent Node crypto implementations", async () => {
  const expected = createHmac("sha256", "test-secret")
    .update(
      JSON.stringify(["register", "id", "a@example.com", "user", "012345"]),
    )
    .digest("hex");
  assert.equal(
    await codeDigest("test-secret", "id", "a@example.com", "user", "012345"),
    expected,
  );
  assert.equal(equalDigest(expected, expected), true);
  assert.equal(equalDigest(expected, expected + "0"), false);
  const parameters = {
    Action: "SingleSendMail",
    TextBody: "中文 !*()",
    AccountName: "sender@example.com",
    SignatureNonce: "nonce",
  };
  const enc = (v: string) =>
    encodeURIComponent(v).replace(
      /[!'()*]/g,
      (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
    );
  const canonical = Object.keys(parameters)
    .sort()
    .map((k) => enc(k) + "=" + enc(parameters[k as keyof typeof parameters]))
    .join("&");
  const signature = createHmac("sha1", "fake-secret&")
    .update("POST&%2F&" + enc(canonical))
    .digest("base64");
  const body = new URLSearchParams(
    await aliyunSignedBody(parameters, "fake-secret"),
  );
  assert.equal(body.get("Signature"), signature);
  assert.equal(body.get("TextBody"), "中文 !*()");
});
test("correct code atomically creates verified account, quota, session, and single-use receipt", async () => {
  const c = await issue();
  const stored = db.prepare("SELECT * FROM email_challenges").get()!;
  assert.notEqual(stored.code_hash, c.code);
  assert.equal(stored.transport, "preview");
  const response = await register(c);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie")!, /HttpOnly/);
  const user = db.prepare("SELECT * FROM users").get()!;
  assert.equal(user.email, "person@example.com");
  assert.equal(user.email_canonical, "person@example.com");
  assert.ok(user.email_verified_at);
  assert.equal(
    db.prepare("SELECT registered_count FROM email_quotas").get()!
      .registered_count,
    1,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 1);
  await rejectStatus(register(c, { username: "other_user" }), 400);
  await rejectStatus(register(c), 409);
});
test("codes bind username/email, expire exactly, and lock after five wrong attempts", async () => {
  const c = await issue();
  await rejectStatus(register(c, { email: "other@example.com" }), 400);
  await rejectStatus(register(c, { username: "other_name" }), 400);
  const wrong = c.code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++)
    await rejectStatus(register(c, { code: wrong }), 400);
  assert.equal(
    db.prepare("SELECT wrong_attempts FROM email_challenges").get()!
      .wrong_attempts,
    5,
  );
  await rejectStatus(register(c), 400);
  time += 60001;
  const next = await issue();
  time = Number(
    db
      .prepare("SELECT expires_at FROM email_challenges WHERE id=?")
      .get(next.challengeId)!.expires_at,
  );
  await rejectStatus(register(next), 400);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get()!.n, 0);
});
test("successful resends supersede older codes; failed sends preserve old valid code and charge attempts", async () => {
  const first = await issue();
  time += 60001;
  await rejectStatus(
    issue(first.email, first.username, undefined, async () => {
      throw Error("provider unavailable");
    }),
    503,
  );
  assert.equal(
    db
      .prepare("SELECT status FROM email_challenges WHERE id=?")
      .get(first.challengeId)!.status,
    "sent",
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM email_send_attempts").get()!.n,
    2,
  );
  time += 60001;
  const second = await issue(first.email, first.username);
  await rejectStatus(register(first), 400);
  await register(second);
});
test("same code concurrent submissions create exactly one account and session", async () => {
  const c = await issue();
  const results = await Promise.allSettled([
    register(c),
    register(c),
    register(c),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get()!.n, 1);
  assert.equal(
    db.prepare("SELECT registered_count FROM email_quotas").get()!
      .registered_count,
    1,
  );
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 1);
});
test("delivery completion order preserves the newest successful code, ignoring failed resends", async () => {
  for (const newerSucceeds of [false, true]) {
    const email = newerSucceeds ? "ordered@example.com" : "failed@example.com";
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const older = issue(email, "older_" + Number(newerSucceeds), undefined, async (message) => {
      await capture(message);
      entered();
      await gate;
    });
    await started;
    time += 60001;
    if (newerSucceeds) {
      const newer = await issue(email, "newer_success");
      const rejected = rejectStatus(older, 409);
      release();
      await rejected;
      await register(newer);
    } else {
      await rejectStatus(issue(email, "newer_failed", undefined, async () => { throw Error("failed"); }), 503);
      release();
      await register(await older);
    }
  }
});
test("Gmail quota reaches ten, bans do not release quota, and the eleventh is rejected", async () => {
  for (let i = 0; i < 10; i++) {
    const c = await issue(`p.e.r.s.o.n+${i}@googlemail.com`, "person_" + i);
    await register(c);
    time += 3600001;
  }
  assert.equal(
    db.prepare("SELECT registered_count FROM email_quotas").get()!
      .registered_count,
    10,
  );
  db.exec("UPDATE users SET account_status='banned'");
  await rejectStatus(issue("person@gmail.com", "eleventh"), 409, /10/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get()!.n, 10);
});
test("last-slot race is guarded by the database and failed insert rolls back code consumption", async () => {
  db.prepare("INSERT INTO email_quotas VALUES(?,9)").run("a@example.com");
  const first = await issue("a@example.com", "last_one");
  // Two previously delivered legitimate challenges contend for the last quota slot.
  const second = {
    ...first,
    challengeId: crypto.randomUUID(),
    username: "last_two",
  };
  db.prepare(
    "INSERT INTO email_challenges(id,canonical,email,username,code_hash,transport,status,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)",
  ).run(
    second.challengeId,
    "a@example.com",
    "a@example.com",
    second.username,
    await codeDigest(
      process.env.MELON_EMAIL_HMAC_SECRET!,
      second.challengeId,
      "a@example.com",
      second.username,
      second.code,
    ),
    "preview",
    "sent",
    time,
    time + 600000,
  );
  const results = await Promise.allSettled([register(first), register(second)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    db.prepare("SELECT registered_count FROM email_quotas").get()!
      .registered_count,
    10,
  );
  assert.equal(
    db
      .prepare("SELECT COUNT(*) n FROM email_challenges WHERE status='sent'")
      .get()!.n,
    1,
  );
});
test("send reservation enforces concurrent cooldown, email hour/day, IP hour and global Beijing day limits", async () => {
  const result = await Promise.allSettled(
    Array.from({ length: 5 }, (_, i) => issue("cool@example.com", "cool_" + i)),
  );
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM email_send_attempts").get()!.n,
    1,
  );
  db.exec("DELETE FROM email_send_attempts; DELETE FROM email_challenges;");
  for (let i = 0; i < 5; i++) {
    await issue("hour@example.com", "hour_" + i);
    time += 60001;
  }
  await rejectStatus(issue("hour@example.com", "hour_next"), 429);
  db.exec("DELETE FROM email_send_attempts; DELETE FROM email_challenges;");
  for (let i = 0; i < 10; i++) {
    await issue("day@example.com", "day_" + i);
    time += 3600001;
  }
  await rejectStatus(issue("day@example.com", "day_next"), 429);
  db.exec("DELETE FROM email_send_attempts; DELETE FROM email_challenges;");
  for (let i = 0; i < 20; i++)
    await issue(`ip${i}@example.com`, "ip_" + i, "198.51.100.1");
  await rejectStatus(
    issue("ip_next@example.com", "ip_next", "198.51.100.1"),
    429,
  );
  db.exec("DELETE FROM email_send_attempts; DELETE FROM email_challenges;");
  for (let i = 0; i < 200; i++)
    db.prepare("INSERT INTO email_send_attempts VALUES(?,?,?,?,?)").run(
      "seed" + i,
      "seed" + i + "@example.com",
      null,
      new Date(time + 8 * 3600000).toISOString().slice(0, 10),
      time,
    );
  await rejectStatus(issue("global@example.com", "global"), 429);
  time = Date.UTC(2026, 9, 28, 16);
  await issue("global@example.com", "global_after_midnight");
});
test("global send cap does not prevent redeeming an already-issued code", async () => {
  const c = await issue();
  for (let i = 0; i < 199; i++)
    db.prepare("INSERT INTO email_send_attempts VALUES(?,?,?,?,?)").run(
      "limit" + i,
      "other@example.com",
      null,
      new Date(time + 8 * 3600000).toISOString().slice(0, 10),
      time,
    );
  await rejectStatus(issue("other@example.com", "other_user"), 429);
  await register(c);
});
test("production refuses preview provider and preview-issued challenges", async () => {
  const c = await issue();
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    assert.throws(() => mailConfiguration(), /生产环境/);
    await rejectStatus(register(c), 503);
    process.env.MELON_MAIL_PROVIDER = "aliyun";
    await rejectStatus(register(c), 400);
  } finally {
    Object.assign(process.env, {
      NODE_ENV: "development",
      MELON_MAIL_PROVIDER: "preview",
    });
  }
});

test("transaction failure rolls back account, quota, code consumption and session together", async () => {
  const c = await issue();
  db.exec(
    "CREATE TRIGGER email_test_failure AFTER INSERT ON users BEGIN SELECT RAISE(ABORT,'TEST_INSERT_FAILURE'); END;",
  );
  try {
    await assert.rejects(register(c), /TEST_INSERT_FAILURE/);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users").get()!.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM email_quotas").get()!.n, 0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sessions").get()!.n, 0);
    assert.equal(
      db
        .prepare("SELECT status FROM email_challenges WHERE id=?")
        .get(c.challengeId)!.status,
      "sent",
    );
  } finally {
    db.exec("DROP TRIGGER email_test_failure");
  }
});

test("portable Aliyun adapter uses signed HTTPS POST without tracking and does not retry failure", async () => {
  const original = globalThis.fetch,
    previous = {
      provider: process.env.MELON_MAIL_PROVIDER,
      key: process.env.MELON_MAIL_ACCESS_KEY_ID,
      secret: process.env.MELON_MAIL_ACCESS_KEY_SECRET,
      from: process.env.MELON_MAIL_FROM,
    };
  let calls = 0;
  Object.assign(process.env, {
    MELON_MAIL_PROVIDER: "aliyun",
    MELON_MAIL_ACCESS_KEY_ID: "fake-access-id",
    MELON_MAIL_ACCESS_KEY_SECRET: "fake-access-secret",
    MELON_MAIL_FROM: "no-reply@notify.example.com",
  });
  try {
    globalThis.fetch = async (input, init) => {
      calls++;
      assert.equal(String(input), "https://dm.aliyuncs.com/");
      assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body));
      assert.equal(body.get("ClickTrace"), "0");
      assert.equal(body.get("ToAddress"), "person@example.com");
      assert.equal(body.get("ReplyToAddress"), "false");
      assert.ok(body.get("Signature"));
      assert.equal(body.get("HtmlBody"), null);
      return Response.json({ RequestId: "fake-request" });
    };
    await sendVerification({
      challengeId: "fake",
      email: "person@example.com",
      username: "user",
      code: "012345",
    });
    assert.equal(calls, 1);
    globalThis.fetch = async () => {
      calls++;
      return Response.json(
        { Code: "InvalidMailAddress.NotFound" },
        { status: 400 },
      );
    };
    await assert.rejects(
      sendVerification({
        challengeId: "fake",
        email: "person@example.com",
        username: "user",
        code: "012345",
      }),
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
    for (const [k, v] of Object.entries({
      MELON_MAIL_PROVIDER: previous.provider,
      MELON_MAIL_ACCESS_KEY_ID: previous.key,
      MELON_MAIL_ACCESS_KEY_SECRET: previous.secret,
      MELON_MAIL_FROM: previous.from,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});
