import { basePath } from "./paths";
import { env } from "@/lib/storage-runtime";
export type User = {
  id: string;
  username: string;
  nickname: string;
  role: string;
  account_status: "active" | "restricted" | "banned";
  restricted_room_id: string | null;
  ban_reason: string | null;
  account_version: number;
  email: string | null;
  email_verified_at: number | null;
};
export const db = () => env.DB!;
export const now = () => Date.now();
export const id = () => crypto.randomUUID();
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export const json = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
export async function one<T = Record<string, unknown>>(
  sql: string,
  ...values: unknown[]
) {
  return db()
    .prepare(sql)
    .bind(...values)
    .first<T>();
}
export async function all<T = Record<string, unknown>>(
  sql: string,
  ...values: unknown[]
) {
  return (
    await db()
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;
}
export async function run(sql: string, ...values: unknown[]) {
  return db()
    .prepare(sql)
    .bind(...values)
    .run();
}
export async function sha(value: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export async function passwordHash(
  password: string,
  salt = crypto.randomUUID(),
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return (
    salt +
    ":" +
    Array.from(new Uint8Array(bits))
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}
export const liveRestrictionRoom = `SELECT r.id FROM game_rooms r
 WHERE r.id=users.restricted_room_id AND r.updated_at>?
 AND r.phase IN ('bidding','tribute','return','playing','roundEnd')
 AND EXISTS (SELECT 1 FROM json_each(r.state,'$.seats') s WHERE json_extract(s.value,'$.id')=users.id)`;

// Reconcile on reads as well as game writes: expired rooms must not grant access.
export function restrictionStatements(time = now(), userId?: string) {
  return [
    db()
      .prepare(`DELETE FROM game_result_receipts WHERE expires<=?`)
      .bind(time),
    db()
      .prepare(
        `INSERT INTO game_result_receipts(token,user_id,room_id,expires)
      SELECT s.token,u.id,u.restricted_room_id,MIN(s.expires,?) FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE u.account_status='restricted' ${userId ? "AND u.id=?" : ""}
      AND EXISTS(SELECT 1 FROM game_rooms r WHERE r.id=u.restricted_room_id AND r.phase IN ('finished','closed'))
      ON CONFLICT(token) DO NOTHING`,
      )
      .bind(time + 300000, ...(userId ? [userId] : [])),
    db()
      .prepare(
        `UPDATE users SET account_status='banned',restricted_room_id=NULL,account_version=account_version+1
      WHERE account_status='restricted' ${userId ? "AND id=?" : ""} AND NOT EXISTS (${liveRestrictionRoom})`,
      )
      .bind(...(userId ? [userId] : []), time - 7 * 86400000),
    db()
      .prepare(
        `DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE account_status='banned' ${userId ? "AND id=?" : ""})`,
      )
      .bind(...(userId ? [userId] : [])),
  ];
}
export async function settleRestrictions(userId?: string) {
  await db().batch(restrictionStatements(now(), userId));
}
export async function getUser(req: Request): Promise<User | null> {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)melon_session=([^;]+)/)?.[1];
  if (!token) return null;
  const hash = await sha(token);
  const load = () =>
    one<User>(
      "SELECT u.id,u.username,u.nickname,u.role,u.account_status,u.restricted_room_id,u.ban_reason,u.account_version,u.email,u.email_verified_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.account_status<>'banned'",
      hash,
      now(),
    );
  let user = await load();
  if (user?.account_status === "restricted") {
    await settleRestrictions(user.id);
    user = await load();
  }
  return user;
}
export async function requireUser(req: Request) {
  const user = await getUser(req);
  if (!user) fail("请先登录，再参与讨论", 401);
  if (user.account_status !== "active")
    fail("账号已受限：" + user.ban_reason + "。仅可完成当前整场牌局", 403);
  return user;
}
export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  if (user.role !== "admin") fail("仅管理员可以执行此操作", 403);
  return user;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (
    origin &&
    origin !== (process.env.MELON_PUBLIC_ORIGIN || new URL(req.url).origin)
  )
    fail("请求来源不被允许", 403);
  if (req.headers.get("sec-fetch-site") === "cross-site")
    fail("请求来源不被允许", 403);
}
export async function body(req: Request) {
  if (Number(req.headers.get("content-length") || 0) > 100000)
    fail("内容过长", 413);
  try {
    const s = await req.text();
    if (s.length > 100000) fail("内容过长", 413);
    const b = JSON.parse(s);
    if (!b || typeof b !== "object" || Array.isArray(b)) fail("请求格式错误");
    return b;
  } catch (e) {
    if ((e as { status?: number }).status) throw e;
    fail("请求格式错误");
  }
}
export function str(value: unknown, name: string, min = 1, max = 10000) {
  if (
    typeof value !== "string" ||
    value.trim().length < min ||
    value.trim().length > max
  )
    fail(`${name}需为 ${min}–${max} 个字符`);
  return value.trim();
}
export const cookie = (value: string, req: Request, maxAge = 604800) =>
  `melon_session=${value}; Path=${basePath || "/"}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${(process.env.MELON_PUBLIC_ORIGIN || req.url).startsWith("https:") ? "; Secure" : ""}`;
