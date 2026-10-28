import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5189/melon",
  directory = resolve(process.env.MELON_DATA_DIR || "");
assert.ok(
  ["127.0.0.1", "localhost"].includes(new URL(base).hostname) &&
    directory.includes("email-qa"),
);
const db = new DatabaseSync(join(directory, "melon.sqlite")),
  tag = "em" + Date.now(),
  password = "EmailQa_12345678";
let checks = 0;
const check = (value: unknown, message: string) => {
  assert.ok(value, message);
  checks++;
};
async function request(
  path: string,
  method = "GET",
  body?: object,
  cookie = "",
  status = 200,
  origin = new URL(base).origin,
) {
  const response = await fetch(base + "/api/" + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-Forwarded-For": "203.0.113.88",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data: any = await response.json();
  assert.equal(response.status, status, JSON.stringify(data));
  checks++;
  check(response.headers.get("cache-control") === "no-store", "never cache");
  return { response, data };
}
const username = tag,
  email = tag + "@example.test";
if(process.argv.includes('--after-restart')){
  const previous=JSON.parse(readFileSync(join(directory,'email-qa-restart.json'),'utf8'));
  check((await request('auth/me','GET',undefined,previous.cookie)).data.user.email===previous.email,'verified identity and session persisted');
  check(db.prepare('SELECT registered_count FROM email_quotas WHERE canonical=?').get(previous.email)!.registered_count===1,'quota persisted');
  check(db.prepare('SELECT status FROM email_challenges WHERE id=?').get(previous.challengeId)!.status==='consumed','used code stays consumed');
  const pending=JSON.parse(readFileSync(join(directory,'uploads','mail-preview-'+previous.pending.challengeId),'utf8'));
  await request('auth/register','POST',{username:previous.pending.username,email:previous.pending.email,challengeId:previous.pending.challengeId,code:pending.code,nickname:'重启邮件验证',password});
  console.log(`PASS: ${checks} email restart checks; verified email, quota, session, consumed code and outstanding code persisted.`);db.close();
}else {
try {
  await request(
    "auth/register",
    "POST",
    { username, nickname: "邮件验证", password },
    "",
    400,
  );
  await request(
    "auth/register/extra",
    "POST",
    { username, nickname: "邮件验证", password },
    "",
    404,
  );
  await request("auth/email-code/extra", "POST", { username, email }, "", 404);
  await request("auth/email-code", "GET", undefined, "", 404);
  await request(
    "auth/email-code",
    "POST",
    { username, email },
    "",
    403,
    "https://evil.example",
  );
  await request(
    "auth/email-code",
    "POST",
    { username, email: "not_email" },
    "",
    400,
  );
  const sent = await request("auth/email-code", "POST", { username, email });
  check(
    !JSON.stringify(sent.data).includes("code_hash") &&
      !Object.hasOwn(sent.data, "code"),
    "response excludes code",
  );
  const challengeId = sent.data.challengeId,
    preview = JSON.parse(
      readFileSync(
        join(directory, "uploads", "mail-preview-" + challengeId),
        "utf8",
      ),
    );
  const rate = await request(
    "auth/email-code",
    "POST",
    { username, email },
    "",
    429,
  );
  check(
    Number(rate.response.headers.get("Retry-After")) > 0 &&
      rate.data.retryAfter > 0,
    "Retry-After exposed",
  );
  await request(
    "auth/register",
    "POST",
    {
      username,
      nickname: "邮件验证",
      password,
      email,
      challengeId,
      code: preview.code === "000000" ? "000001" : "000000",
    },
    "",
    400,
  );
  const registered = await request("auth/register", "POST", {
    username,
    nickname: "邮件验证",
    password,
    email,
    challengeId,
    code: preview.code,
    role: "admin",
    email_verified_at: 1,
  });
  const cookie = registered.response.headers.get("set-cookie")!.split(";")[0];
  const me = (await request("auth/me", "GET", undefined, cookie)).data.user;
  check(
    me.email === email && me.email_verified_at && me.role === "member",
    "verified identity only, no role injection",
  );
  const profile = (await request("users/" + me.id)).data;
  check(
    !Object.hasOwn(profile.user, "email") &&
      !Object.hasOwn(profile.user, "email_canonical") &&
      !Object.hasOwn(profile.user, "email_verified_at"),
    "public profile excludes email",
  );
  await request(
    "admin/users?email=" + encodeURIComponent(email),
    "GET",
    undefined,
    cookie,
    403,
  );
  db.prepare("UPDATE users SET role='admin' WHERE id=?").run(me.id);
  const managed = (
    await request(
      "admin/users?email=" + encodeURIComponent(email),
      "GET",
      undefined,
      cookie,
    )
  ).data;
  check(
    managed.total === 1 && managed.items[0].email_account_count === 1,
    "admin email filter and lifetime counter",
  );
  await request("auth/logout", "POST", undefined, cookie);
  await request(
    "auth/register",
    "POST",
    {
      username: tag + "_other",
      nickname: "重放验证",
      password,
      email,
      challengeId,
      code: preview.code,
    },
    "",
    400,
  );
  const login = await request("auth/login", "POST", { username, password });
  const loginCookie = login.response.headers.get("set-cookie")!.split(";")[0];
  check(
    (await request("auth/me", "GET", undefined, loginCookie)).data.user
      .email === email,
    "password login unchanged",
  );
  const outbox = await fetch(base + "/api/uploads/mail-preview-" + challengeId);
  assert.equal(outbox.status, 404);
  checks++;
  const pending={username:tag+'_pending',email:tag+'_pending@example.test',challengeId:(await request('auth/email-code','POST',{username:tag+'_pending',email:tag+'_pending@example.test'})).data.challengeId};
  writeFileSync(
    join(directory, "email-qa-restart.json"),
    JSON.stringify({
      username,
      email,
      cookie: loginCookie,
      userId: me.id,
      challengeId,
      pending,
    }),
    { mode: 0o600 },
  );
  console.log(
    `PASS: ${checks} email HTTP/privacy checks; restart fixture saved.`,
  );
} finally {
  db.close();
}

}
