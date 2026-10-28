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
        if(parts.length>4)return json({error:"接口不存在"},404);
        response = await adminAPI(req, key, action,parts[3]);
        break;
      case "categories":
      case "stats":
        response = await catalogAPI(req, resource);
        break;
    }
    return response ?? json({ error: "接口不存在" }, 404);
  } catch (error) {
    const e = error as Error & { status?: number };
    if (e.message.includes("MELON_ACCOUNT_RESTRICTED")) return json({error:"账号已封禁或受限，请联系管理员"},403);
    if (!e.status) console.error(e);
    return json(
      { error: e.status ? e.message : "服务暂时出了点问题，请稍后重试" },
      e.status || 500,
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
