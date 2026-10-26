import { all, one, json } from "@/lib/server";

export async function catalogAPI(
  req: Request,
  resource: string,
): Promise<Response | undefined> {
  const method = req.method;
  if (resource === "categories" && method === "GET")
    return json(
      await all(
        "SELECT c.*,(SELECT COUNT(*) FROM posts p WHERE p.category_id=c.id AND p.hidden=0) AS count FROM categories c ORDER BY c.rowid",
      ),
    );
  if (resource === "stats" && method === "GET")
    return json(
      await one(
        "SELECT (SELECT COUNT(*) FROM posts WHERE hidden=0) posts,(SELECT COUNT(*) FROM users) users,(SELECT COUNT(*) FROM replies r JOIN posts p ON p.id=r.post_id WHERE r.hidden=0 AND p.hidden=0) replies",
      ),
    );
}
