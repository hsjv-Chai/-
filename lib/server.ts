import {basePath} from "./paths";
import { env } from "@/lib/storage-runtime";
export type User = {
  id: string;
  username: string;
  nickname: string;
  role: string;
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
export async function getUser(req: Request): Promise<User | null> {
  const token = req.headers
    .get("cookie")
    ?.match(/(?:^|;\s*)melon_session=([^;]+)/)?.[1];
  if (!token) return null;
  return one<User>(
    "SELECT u.id,u.username,u.nickname,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?",
    await sha(token),
    now(),
  );
}
export async function requireUser(req: Request) {
  const user = await getUser(req);
  if (!user) fail("请先登录，再参与讨论", 401);
  return user;
}
export async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  if (user.role !== "admin") fail("仅管理员可以执行此操作", 403);
  return user;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== (process.env.MELON_PUBLIC_ORIGIN || new URL(req.url).origin))
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
export async function visiblePost(postId: string) {
  const p = await one<{ id: string; user_id: string; hidden: number }>(
    "SELECT id,user_id,hidden FROM posts WHERE id=? AND hidden=0",
    postId,
  );
  if (!p) fail("帖子不存在或暂不可见", 404);
  return p;
}
export const postSelect = `SELECT p.*,u.nickname,u.username,c.name AS category_name,
(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) AS like_count,
(SELECT COUNT(*) FROM replies r WHERE r.post_id=p.id AND r.hidden=0) AS reply_count,
(SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id AND l.user_id=?) AS liked,
(SELECT id FROM uploads i WHERE i.post_id=p.id ORDER BY i.created_at LIMIT 1) AS cover,
((SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id AND l.created_at>=?) + 2*(SELECT COUNT(DISTINCT r.user_id || ':' || CAST((r.created_at+28800000)/86400000 AS INTEGER)) FROM replies r WHERE r.post_id=p.id AND r.hidden=0 AND r.user_id<>p.user_id AND r.created_at>=?)) AS heat
FROM posts p JOIN users u ON u.id=p.user_id JOIN categories c ON c.id=p.category_id`;
export const selectArgs = (user: User | null) => [
  user?.id || "",
  now() - 7 * 86400000,
  now() - 7 * 86400000,
];
