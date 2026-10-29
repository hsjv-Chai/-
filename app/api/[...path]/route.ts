import { gardenAPI } from "@/lib/garden/api";
import { gamesAPI } from "@/lib/games/api";
import { stripBasePath } from "@/lib/paths";
import { one, json, sameOrigin } from "@/lib/server";
import { authAPI } from "@/lib/community/auth";
import { postsAPI } from "@/lib/community/posts";
import { uploadsAPI } from "@/lib/community/uploads";
import { usersAPI } from "@/lib/community/users";
import { adminAPI } from "@/lib/community/admin";
import { catalogAPI } from "@/lib/community/catalog";
import { museumAPI } from "@/lib/museum/public";
import { museumAdminAPI } from "@/lib/museum/admin";

export const dynamic = "force-dynamic";

// All resource handlers stay behind the same origin check and error boundary.
async function handler(req: Request): Promise<Response> {
  try {
    const parts = stripBasePath(new URL(req.url).pathname)
      .slice(5)
      .split("/")
      .filter(Boolean);
    const [resource, key, action] = parts;
    if (req.method !== "GET") sameOrigin(req);
    let response: Response | undefined;
    switch (resource) {
      case "museum":
        response = await museumAPI(req, parts.slice(1));
        break;
      case "garden":
        return await gardenAPI(req, parts.slice(1));
      case "games":
        return await gamesAPI(req, key);
      case "health":
        if (req.method === "GET") {
          await one("SELECT 1 AS ok");
          return json({ ok: true });
        }
        break;
      case "auth":
        if (parts.length !== 2) return json({ error: "接口不存在" }, 404);
        response = await authAPI(req, key);
        break;
      case "posts":
        response = await postsAPI(req, key, action);
        break;
      case "uploads":
        response = await uploadsAPI(req, key);
        break;
      case "users":
        response = await usersAPI(req, key);
        break;
      case "admin":
        if (key === "museum") {
          response = await museumAdminAPI(req, parts.slice(2));
          break;
        }
        if (parts.length > 4) return json({ error: "接口不存在" }, 404);
        response = await adminAPI(req, key, action, parts[3]);
        break;
      case "categories":
      case "stats":
        response = await catalogAPI(req, resource);
        break;
    }
    return response ?? json({ error: "接口不存在" }, 404);
  } catch (error) {
    const e = error as Error & { status?: number; retryAfter?: number };
    if (e.message.includes("MELON_ACCOUNT_RESTRICTED"))
      return json({ error: "账号已封禁或受限，请联系管理员" }, 403);
    if (e.message.includes("EMAIL_QUOTA_FULL"))
      return json({ error: "该邮箱已达到 10 个账号的注册上限" }, 409);
    if (
      e.message.includes("EMAIL_VERIFICATION_REQUIRED") ||
      e.message.includes("EMAIL_IMMUTABLE")
    )
      return json({ error: "邮箱验证无效，请重新注册" }, 400);
    if (e.message.includes("UNIQUE constraint failed: users.username"))
      return json({ error: "这个用户名已被使用" }, 409);
    if (!e.status) console.error(e);
    return json(
      {
        error: e.status ? e.message : "服务暂时出了点问题，请稍后重试",
        ...(e.retryAfter ? { retryAfter: e.retryAfter } : {}),
      },
      e.status || 500,
      e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {},
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
