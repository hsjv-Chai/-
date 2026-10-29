import { all, one, run, now, id, json, fail, requireAdmin, body } from "@/lib/server";
import { blankExhibition, exhibitionDraft, itemDraft, validatePublication } from "./model";
import { adminGuard, statement, tokenGuard, exhibitionRow, editor, revision, mutate, checkImages } from "./store";
import { uploadImage } from "./images";
import { pageNumber } from "./public";

export async function museumAdminAPI(req: Request, parts: string[]): Promise<Response | undefined> {
  const user = await requireAdmin(req);
  const [resource, key, action, itemId] = parts, method = req.method;
  if (resource !== "exhibitions" || parts.length > 4) return undefined;
  const supported = parts.length === 1 && ["GET", "POST"].includes(method)
    || parts.length === 2 && ["GET", "PATCH"].includes(method)
    || parts.length === 3 && (action === "preview" && method === "GET" || ["images", "items", "reorder", "publish", "unpublish"].includes(action) && method === "POST")
    || parts.length === 4 && action === "items" && ["PATCH", "DELETE"].includes(method);
  if (!supported) return undefined;
  if (parts.length === 1 && method === "GET") {
    const url = new URL(req.url), page = pageNumber(url);
    const rows = await all<{ id: string; draft: string; revision: number; is_public: number; live_release_id: string | null; updated_at: number }>("SELECT * FROM museum_exhibitions ORDER BY updated_at DESC,id LIMIT 20 OFFSET ?", (page - 1) * 20);
    const total = await one<{ total: number }>("SELECT COUNT(*) total FROM museum_exhibitions");
    return json({ items: rows.map(row => ({ id: row.id, title: JSON.parse(row.draft).title, revision: row.revision, status: row.is_public ? "published" : row.live_release_id ? "offline" : "draft", updatedAt: row.updated_at })), total: total!.total, page });
  }
  if (parts.length === 1 && method === "POST") {
    const b = await body(req), draft = exhibitionDraft(b.draft || blankExhibition()), key = id(), time = now();
    const result = await run(`INSERT INTO museum_exhibitions(id,draft,created_at,updated_at) SELECT ?,?,?,? WHERE ${adminGuard}`, key, JSON.stringify(draft), time, time, user.id, user.account_version);
    if (!result.meta.changes) fail("管理员权限已失效", 403);
    return json(await editor(await exhibitionRow(key)), 201);
  }
  if (!key) return undefined;
  const row = await exhibitionRow(key);
  if (parts.length === 2 && method === "GET") return json(await editor(row));
  if (parts.length === 3 && action === "preview" && method === "GET") return json(await editor(row));
  if (parts.length === 3 && action === "images" && method === "POST") return json({ id: await uploadImage(req, key, user) }, 201);
  if (method !== "POST" && method !== "PATCH" && method !== "DELETE") return undefined;
  const b = await body(req), expected = revision(b.revision);
  if (expected !== row.revision) fail("草稿已被其他页面更新，请先重新加载；当前输入仍为你保留", 409);
  if (parts.length === 2 && method === "PATCH") {
    const draft = exhibitionDraft(b.draft);
    if (draft.cover) await checkImages(key, [draft.cover]);
    const next = await mutate(user, key, expected, token => [statement(`UPDATE museum_exhibitions SET draft=? WHERE id=? AND mutation_token=?`, JSON.stringify(draft), key, token)]);
    return json({ revision: next });
  }
  if (action === "items" && parts.length === 3 && method === "POST") {
    const item = itemDraft(b.item), itemKey = id();
    await checkImages(key, item.images.map(image => image.id));
    const next = await mutate(user, key, expected, token => [statement(`INSERT INTO museum_items(id,exhibition_id,content,position) SELECT ?,?,?,COALESCE((SELECT MAX(position)+1 FROM museum_items WHERE exhibition_id=?),0) WHERE ${tokenGuard}`, itemKey, key, JSON.stringify(item), key, key, token)]);
    return json({ id: itemKey, revision: next }, 201);
  }
  if (action === "items" && itemId && parts.length === 4 && (method === "PATCH" || method === "DELETE")) {
    if (!(await one("SELECT id FROM museum_items WHERE id=? AND exhibition_id=? AND removed=0", itemId, key))) fail("展品不存在", 404);
    const item = method === "PATCH" ? itemDraft(b.item) : null;
    if (item) await checkImages(key, item.images.map(image => image.id));
    const next = await mutate(user, key, expected, token => [item
      ? statement(`UPDATE museum_items SET content=? WHERE id=? AND exhibition_id=? AND ${tokenGuard}`, JSON.stringify(item), itemId, key, key, token)
      : statement(`UPDATE museum_items SET removed=1 WHERE id=? AND exhibition_id=? AND ${tokenGuard}`, itemId, key, key, token)]);
    return json({ revision: next });
  }
  if (action === "reorder" && parts.length === 3 && method === "POST") {
    const current = await all<{ id: string }>("SELECT id FROM museum_items WHERE exhibition_id=? AND removed=0", key);
    if (!Array.isArray(b.ids) || b.ids.length !== current.length || new Set(b.ids).size !== current.length || current.some(item => !b.ids.includes(item.id))) fail("排序列表需包含本展览的全部展品");
    const next = await mutate(user, key, expected, token => [statement(`UPDATE museum_items SET position=(SELECT CAST(j.key AS INTEGER) FROM json_each(?) j WHERE j.value=museum_items.id) WHERE exhibition_id=? AND removed=0 AND ${tokenGuard}`, JSON.stringify(b.ids), key, key, token)]);
    return json({ revision: next });
  }
  if (action === "publish" && parts.length === 3 && method === "POST") {
    const draft = await editor(row);
    validatePublication(draft.draft, draft.items);
    await checkImages(key, [draft.draft.cover, ...draft.items.flatMap(item => item.images.map(image => image.id))]);
    const release = id(), time = now();
    const next = await mutate(user, key, expected, token => [
      statement(`INSERT INTO museum_releases(id,exhibition_id,content,created_at) SELECT ?,id,draft,? FROM museum_exhibitions WHERE id=? AND mutation_token=?`, release, time, key, token),
      statement(`INSERT INTO museum_release_items(release_id,item_id,position,content) SELECT ?,id,position,content FROM museum_items WHERE exhibition_id=? AND removed=0 AND ${tokenGuard}`, release, key, key, token),
      statement("UPDATE museum_exhibitions SET live_release_id=?,is_public=1,published_at=? WHERE id=? AND mutation_token=?", release, time, key, token),
    ]);
    return json({ revision: next });
  }
  if (action === "unpublish" && parts.length === 3 && method === "POST") {
    const next = await mutate(user, key, expected, token => [statement("UPDATE museum_exhibitions SET is_public=0 WHERE id=? AND mutation_token=?", key, token)]);
    return json({ revision: next });
  }
  return undefined;
}
