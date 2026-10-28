import {
  db,
  one,
  all,
  now,
  id,
  json,
  fail,
  str,
  passwordHash,
  sha,
  cookie,
} from "@/lib/server";
import { registrationIp } from "@/lib/registration-ip";
import {
  normalizeEmail,
  randomCode,
  codeDigest,
  equalDigest,
  CODE_LIFETIME,
} from "./model";
import {
  mailConfiguration,
  sendVerification,
  verificationSecret,
} from "./provider";
const clock = "CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)";
const day = "strftime('%Y-%m-%d','now','+8 hours')";
function emailOf(value: unknown) {
  try {
    return normalizeEmail(value);
  } catch {
    fail("请填写有效邮箱");
  }
}
export function registrationUsername(value: unknown) {
  const username = str(value, "用户名", 3, 24).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(username))
    fail("用户名只能包含英文字母、数字和下划线");
  return username;
}
function settings() {
  try {
    return mailConfiguration();
  } catch (e) {
    fail((e as Error).message, 503);
  }
}
function secret() {
  try {
    return verificationSecret();
  } catch (e) {
    fail((e as Error).message, 503);
  }
}
async function rateError(canonical: string, ip: string | null): Promise<never> {
  if (
    (
      await one<{ registered_count: number }>(
        "SELECT registered_count FROM email_quotas WHERE canonical=?",
        canonical,
      )
    )?.registered_count! >= 10
  )
    fail("该邮箱已达到 10 个账号的注册上限", 409);
  const time = now(),
    beijing = new Date(time + 8 * 3600000),
    midnight =
      Date.UTC(
        beijing.getUTCFullYear(),
        beijing.getUTCMonth(),
        beijing.getUTCDate() + 1,
      ) -
      8 * 3600000;
  const rows = await all<{
    kind: string;
    count: number;
    first: number;
    last: number;
  }>(
    `SELECT 'email_hour' kind,COUNT(*) count,MIN(created_at) first,MAX(created_at) last FROM email_send_attempts WHERE canonical=? AND created_at>? UNION ALL SELECT 'email_day',COUNT(*),MIN(created_at),MAX(created_at) FROM email_send_attempts WHERE canonical=? AND day=${day} UNION ALL SELECT 'ip_hour',COUNT(*),MIN(created_at),MAX(created_at) FROM email_send_attempts WHERE ip=? AND created_at>? UNION ALL SELECT 'global_day',COUNT(*),MIN(created_at),MAX(created_at) FROM email_send_attempts WHERE day=${day}`,
    canonical,
    time - 3600000,
    canonical,
    ip,
    time - 3600000,
  );
  let retry = 1;
  for (const r of rows) {
    if (r.kind === "email_hour" && r.last)
      retry = Math.max(retry, Math.ceil((r.last + 60000 - time) / 1000));
    if (
      (r.kind === "email_hour" && r.count >= 5) ||
      (r.kind === "ip_hour" && ip && r.count >= 20)
    )
      retry = Math.max(retry, Math.ceil((r.first + 3600000 - time) / 1000));
    if (
      (r.kind === "email_day" && r.count >= 10) ||
      (r.kind === "global_day" && r.count >= 200)
    )
      retry = Math.max(retry, Math.ceil((midnight - time) / 1000));
  }
  throw Object.assign(new Error("验证码发送过于频繁，请稍后再试"), {
    status: 429,
    retryAfter: retry,
  });
}
export async function issueEmailCode(
  req: Request,
  b: Record<string, unknown>,
  sender: typeof sendVerification = sendVerification,
) {
  const username = registrationUsername(b.username),
    email = emailOf(b.email),
    config = settings();
  if (await one("SELECT id FROM users WHERE username=?", username))
    fail("这个用户名已被使用", 409);
  const challengeId = id(),
    code = randomCode(),
    digest = await codeDigest(
      config.secret,
      challengeId,
      email.canonical,
      username,
      code,
    ),
    ip = registrationIp(req);
  const result = (await db().batch([
    db().prepare(
      `DELETE FROM email_send_attempts WHERE created_at<${clock}-172800000`,
    ),
    db().prepare(
      `DELETE FROM email_challenges WHERE created_at<${clock}-172800000`,
    ),
    db()
      .prepare(
        `INSERT INTO email_send_attempts(id,canonical,ip,day,created_at) SELECT ?,?,?,${day},${clock}
      WHERE COALESCE((SELECT registered_count FROM email_quotas WHERE canonical=?),0)<10
      AND NOT EXISTS(SELECT 1 FROM email_send_attempts WHERE canonical=? AND created_at>${clock}-60000)
      AND (SELECT COUNT(*) FROM email_send_attempts WHERE canonical=? AND created_at>${clock}-3600000)<5
      AND (SELECT COUNT(*) FROM email_send_attempts WHERE canonical=? AND day=${day})<10
      AND (? IS NULL OR (SELECT COUNT(*) FROM email_send_attempts WHERE ip=? AND created_at>${clock}-3600000)<20)
      AND (SELECT COUNT(*) FROM email_send_attempts WHERE day=${day})<200`,
      )
      .bind(
        challengeId,
        email.canonical,
        ip,
        email.canonical,
        email.canonical,
        email.canonical,
        email.canonical,
        ip,
        ip,
      ),
    db()
      .prepare(
        `INSERT INTO email_challenges(id,canonical,email,username,code_hash,transport,status,created_at,expires_at)
      SELECT id,canonical,?,?,?,?,'pending',created_at,created_at+? FROM email_send_attempts WHERE id=?`,
      )
      .bind(
        email.address,
        username,
        digest,
        config.provider,
        CODE_LIFETIME,
        challengeId,
      ),
  ])) as { meta: { changes: number } }[];
  if (!result[2].meta.changes) return rateError(email.canonical, ip);
  try {
    await sender({ challengeId, email: email.canonical, username, code });
  } catch {
    await db()
      .prepare(
        "UPDATE email_challenges SET status='failed' WHERE id=? AND status='pending'",
      )
      .bind(challengeId)
      .run();
    fail("验证码发送失败，请稍后重试；已收到的旧验证码在有效期内仍可使用", 503);
  }
  // A failed or still-pending resend must not invalidate a successful delivery.
  // If an older slow request finishes last, preserve the newer successful code.
  const latest = `(SELECT a.id FROM email_send_attempts a JOIN email_challenges c ON c.id=a.id WHERE a.canonical=? AND (c.status NOT IN ('pending','failed') OR a.id=?) ORDER BY a.created_at DESC,a.rowid DESC LIMIT 1)=?`;
  const activated = (await db().batch([
    db()
      .prepare(
        `UPDATE email_challenges SET status='superseded' WHERE canonical=? AND status='sent' AND ${latest} AND EXISTS(SELECT 1 FROM email_challenges WHERE id=? AND status='pending')`,
      )
      .bind(email.canonical, email.canonical, challengeId, challengeId, challengeId),
    db()
      .prepare(
        `UPDATE email_challenges SET status='sent',expires_at=${clock}+? WHERE id=? AND status='pending' AND ${latest}`,
      )
      .bind(CODE_LIFETIME, challengeId, email.canonical, challengeId, challengeId),
  ])) as { meta: { changes: number } }[];
  if (!activated[1].meta.changes) fail("验证码请求已更新，请重新获取", 409);
  return json({ challengeId, expiresIn: 600, retryAfter: 60 });
}
type Challenge = {
  id: string;
  canonical: string;
  username: string;
  code_hash: string;
  status: string;
  expires_at: number;
  wrong_attempts: number;
  transport: string;
};
export async function registerVerified(
  req: Request,
  b: Record<string, unknown>,
) {
  const username = registrationUsername(b.username),
    password = str(b.password, "密码", 8, 128),
    nickname = str(b.nickname, "昵称", 2, 20);
  if (await one("SELECT id FROM users WHERE username=?", username))
    fail("这个用户名已被使用", 409);
  const email = emailOf(b.email),
    challengeId = str(b.challengeId, "验证码请求标识", 36, 36),
    code = str(b.code, "验证码", 6, 6);
  if (!/^\d{6}$/.test(code)) fail("请输入 6 位数字验证码");
  const digest = await codeDigest(
    secret(),
    challengeId,
    email.canonical,
    username,
    code,
  );
  const challenge = await one<Challenge>(
    "SELECT id,canonical,username,code_hash,status,expires_at,wrong_attempts,transport FROM email_challenges WHERE id=?",
    challengeId,
  );
  if (
    !challenge ||
    challenge.canonical !== email.canonical ||
    challenge.username !== username ||
    challenge.status !== "sent" ||
    challenge.expires_at <= now() ||
    challenge.wrong_attempts >= 5 ||
    (process.env.NODE_ENV === "production" && challenge.transport !== "aliyun")
  )
    fail("验证码无效或已过期，请重新获取");
  if (!equalDigest(challenge.code_hash, digest)) {
    await db()
      .prepare(
        `UPDATE email_challenges SET wrong_attempts=MIN(wrong_attempts+1,5),status=CASE WHEN wrong_attempts>=4 THEN 'locked' ELSE status END WHERE id=? AND status='sent' AND expires_at>${clock}`,
      )
      .bind(challengeId)
      .run();
    fail("验证码错误，连续输错 5 次后需重新获取");
  }
  const uid = id(),
    token = id() + id(),
    tokenHash = await sha(token),
    hash = await passwordHash(password),
    ip = registrationIp(req),
    alertId = id();
  const consumed = `EXISTS(SELECT 1 FROM email_challenges WHERE id=? AND status='consumed' AND consumed_by=?)`;
  const results = (await db().batch([
    db()
      .prepare(
        `UPDATE email_challenges SET status='consumed',consumed_by=?,consumed_at=${clock} WHERE id=? AND canonical=? AND username=? AND code_hash=? AND status='sent' AND expires_at>${clock} AND wrong_attempts<5
      AND COALESCE((SELECT registered_count FROM email_quotas WHERE canonical=?),0)<10 AND NOT EXISTS(SELECT 1 FROM users WHERE username=?)`,
      )
      .bind(
        uid,
        challengeId,
        email.canonical,
        username,
        digest,
        email.canonical,
        username,
      ),
    db()
      .prepare(
        `INSERT INTO users(id,username,nickname,password,role,created_at,registration_ip,email,email_canonical,email_verified_at)
      SELECT ?,?,?,?,'member',${clock},?,?,?,${clock} WHERE ${consumed}`,
      )
      .bind(
        uid,
        username,
        nickname,
        hash,
        ip,
        email.address,
        email.canonical,
        challengeId,
        uid,
      ),
    db()
      .prepare(
        `INSERT INTO sessions(token,user_id,expires) SELECT ?,id,${clock}+604800000 FROM users WHERE id=?`,
      )
      .bind(tokenHash, uid),
    db()
      .prepare(
        `INSERT INTO registration_alerts(id,ip,window_start,created_at,account_count)
      SELECT ?,?,(SELECT created_at-600000 FROM users WHERE id=?),(SELECT created_at FROM users WHERE id=?),COUNT(*) FROM users
      WHERE registration_ip=? AND created_at BETWEEN (SELECT created_at-600000 FROM users WHERE id=?) AND (SELECT created_at FROM users WHERE id=?) HAVING COUNT(*)>=5`,
      )
      .bind(alertId, ip, uid, uid, ip, uid, uid),
    db()
      .prepare(
        `INSERT INTO registration_alert_users(alert_id,user_id) SELECT a.id,u.id FROM registration_alerts a JOIN users u ON u.registration_ip=a.ip AND u.created_at BETWEEN a.window_start AND a.created_at WHERE a.id=?`,
      )
      .bind(alertId),
    db()
      .prepare(
        `DELETE FROM auth_attempts WHERE key=? AND EXISTS(SELECT 1 FROM users WHERE id=?)`,
      )
      .bind(username, uid),
  ])) as { meta: { changes: number } }[];
  if (!results[1].meta.changes) {
    if (await one("SELECT id FROM users WHERE username=?", username))
      fail("这个用户名已被使用", 409);
    if (
      (
        await one<{ registered_count: number }>(
          "SELECT registered_count FROM email_quotas WHERE canonical=?",
          email.canonical,
        )
      )?.registered_count! >= 10
    )
      fail("该邮箱已达到 10 个账号的注册上限", 409);
    fail("验证码已使用或失效，请重新获取", 409);
  }
  return json({ ok: true }, 200, { "Set-Cookie": cookie(token, req) });
}
