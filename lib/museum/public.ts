import { all, one, json, fail } from "@/lib/server";
import { readImage } from "./images";
import type { Exhibition, MuseumItem } from "./model";

const visible = "FROM museum_exhibitions e JOIN museum_releases r ON r.id=e.live_release_id AND r.exhibition_id=e.id WHERE e.is_public=1";
const columns = "e.id,e.published_at,r.content,(SELECT COUNT(*) FROM museum_release_items WHERE release_id=r.id) count";
export const pageNumber = (url: URL) => Math.max(1, Math.min(100000, Math.floor(Number(url.searchParams.get("page")) || 1)));
function presentation(row: { id: string; content: string; published_at: number; count: number }): Exhibition {
  return { ...JSON.parse(row.content), id: row.id, publishedAt: row.published_at, count: row.count };
}
export async function museumAPI(req: Request, parts: string[]) {
  if (req.method !== "GET") return undefined;
  const [resource, key] = parts;
  const url = new URL(req.url), page = pageNumber(url);
  if (resource === "images" && key && parts.length === 2) return readImage(req, key);
  if (resource === "exhibitions" && parts.length === 1) {
    const query = "%" + (url.searchParams.get("q") || "").trim().slice(0, 100).replace(/[\\%_]/g, "\\$&") + "%";
    const filter = " AND (json_extract(r.content,'$.title') LIKE ? ESCAPE '\\' OR json_extract(r.content,'$.summary') LIKE ? ESCAPE '\\')";
    const total = await one<{ total: number }>("SELECT COUNT(*) total " + visible + filter, query, query);
    const rows = await all<{ id: string; content: string; published_at: number; count: number }>(`SELECT ${columns} ${visible} ${filter} ORDER BY e.published_at DESC,e.id DESC LIMIT 12 OFFSET ?`, query, query, (page - 1) * 12);
    return json({ items: rows.map(presentation), total: total!.total, page });
  }
  if (resource === "exhibitions" && key && parts.length === 2) {
    const row = await one<{ id: string; content: string; published_at: number; count: number; live_release_id: string }>(`SELECT ${columns},e.live_release_id ${visible} AND e.id=?`, key);
    if (!row) fail("展览不存在或暂未公开", 404);
    const items = await all<{ item_id: string; position: number; content: string }>("SELECT * FROM museum_release_items WHERE release_id=? ORDER BY position,item_id LIMIT 20 OFFSET ?", row.live_release_id, (page - 1) * 20);
    return json({ exhibition: presentation(row), items: items.map(item => ({ ...JSON.parse(item.content), id: item.item_id, position: item.position })), total: row.count, page });
  }
  if (resource === "items" && key && parts.length === 2) {
    const row = await one<{ content: string; position: number; release_id: string; exhibition_id: string; exhibition_content: string }>(`SELECT item.content,item.position,item.release_id,e.id exhibition_id,r.content exhibition_content
      FROM museum_release_items item JOIN museum_releases r ON r.id=item.release_id
      JOIN museum_exhibitions e ON e.id=r.exhibition_id AND e.live_release_id=r.id
      WHERE item.item_id=? AND e.is_public=1`, key);
    if (!row) fail("展品不存在或暂未公开", 404);
    const neighbor = async (previous: boolean) => {
      const op = previous ? "<" : ">", order = previous ? "DESC" : "ASC";
      const item = await one<{ item_id: string; content: string }>(`SELECT item_id,content FROM museum_release_items WHERE release_id=? AND (position ${op} ? OR (position=? AND item_id ${op} ?)) ORDER BY position ${order},item_id ${order} LIMIT 1`, row.release_id, row.position, row.position, key);
      return item ? { id: item.item_id, title: JSON.parse(item.content).title as string } : null;
    };
    return json({ item: { ...JSON.parse(row.content), id: key, position: row.position } as MuseumItem, exhibition: { id: row.exhibition_id, title: JSON.parse(row.exhibition_content).title }, previous: await neighbor(true), next: await neighbor(false) });
  }
  return undefined;
}
