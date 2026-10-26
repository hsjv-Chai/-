import { one, fail, now, type User } from "@/lib/server";

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
