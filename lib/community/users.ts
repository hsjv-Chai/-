import { all, one, json, fail } from "@/lib/server";

export async function usersAPI(
  req: Request,
  key?: string,
): Promise<Response | undefined> {
  const method = req.method;
  if (key && method === "GET") {
    const user = await one(
      "SELECT id,username,nickname,created_at FROM users WHERE id=?",
      key,
    );
    if (!user) fail("用户不存在", 404);
    const replies = await all(
      "SELECT r.*,p.title FROM replies r JOIN posts p ON p.id=r.post_id WHERE r.user_id=? AND r.hidden=0 AND p.hidden=0 ORDER BY r.created_at DESC LIMIT 100",
      key,
    );
    return json({ user, replies });
  }
}
