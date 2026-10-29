import { one, run, id, now, fail, getUser, type User } from "@/lib/server";
import { env } from "@/lib/storage-runtime";
import { adminGuard, exhibitionRow } from "./store";

export async function uploadImage(req: Request, exhibitionId: string, user: User) {
  await exhibitionRow(exhibitionId);
  if (Number(req.headers.get("content-length") || 0) > 5 * 1024 * 1024 + 10000) fail("每张图片不能超过 5 MB", 413);
  const form = await req.formData(), file = form.get("file");
  if (!(file instanceof File) || !file.size) fail("请选择图片");
  if (file.size > 5 * 1024 * 1024) fail("每张图片不能超过 5 MB", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg"
    : bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10" ? "image/png"
    : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" ? "image/webp" : null;
  if (!mime || mime !== file.type) fail("仅支持有效的 JPEG、PNG 或 WebP 图片");
  const key = "museum-" + id();
  await env.BUCKET!.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    const result = await run(`INSERT INTO museum_images(id,exhibition_id,mime,created_by,created_at) SELECT ?,?,?,?,? WHERE ${adminGuard}`, key, exhibitionId, mime, user.id, now(), user.id, user.account_version);
    if (!result.meta.changes) fail("管理员权限已失效", 403);
  } catch (error) { await env.BUCKET!.delete(key); throw error; }
  return key;
}

export async function readImage(req: Request, key: string) {
  const image = await one<{ mime: string; exhibition_id: string }>("SELECT * FROM museum_images WHERE id=?", key);
  if (!image) fail("图片不存在", 404);
  const visible = await one(`SELECT e.id FROM museum_exhibitions e JOIN museum_releases r ON r.id=e.live_release_id AND r.exhibition_id=e.id
    WHERE e.id=? AND e.is_public=1 AND (
      json_extract(r.content,'$.cover')=? OR EXISTS(
        SELECT 1 FROM museum_release_items item,json_each(item.content,'$.images') image
        WHERE item.release_id=r.id AND json_extract(image.value,'$.id')=?))`, image.exhibition_id, key, key);
  if (!visible) {
    const user = await getUser(req);
    if (!user || user.role !== "admin" || user.account_status !== "active") fail("图片不存在", 404);
  }
  const file = await env.BUCKET!.get(key);
  if (!file) fail("图片不存在", 404);
  return new Response(file.body, { headers: { "Content-Type": image.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
