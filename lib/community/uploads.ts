import {
  one,
  run,
  now,
  id,
  json,
  fail,
  getUser,
  requireUser,
  body,
} from "@/lib/server";
import { env } from "@/lib/storage-runtime";

export async function uploadsAPI(
  req: Request,
  key?: string,
): Promise<Response | undefined> {
  const method = req.method;

  if (method === "POST" && !key) {
    const user = await requireUser(req);
    if (
      Number(req.headers.get("content-length") || 0) >
      5 * 1024 * 1024 + 10000
    )
      fail("每张图片不能超过 5 MB", 413);
    const form = await req.formData(),
      file = form.get("file");
    if (!(file instanceof File) || file.size === 0) fail("请选择图片");
    if (file.size > 5 * 1024 * 1024) fail("每张图片不能超过 5 MB", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime =
      bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        ? "image/jpeg"
        : bytes.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10"
          ? "image/png"
          : String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
              String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
            ? "image/webp"
            : null;
    if (!mime || mime !== file.type)
      fail("仅支持有效的 JPEG、PNG 或 WebP 图片");
    const uid = id();
    await env.BUCKET!.put(uid, bytes, {
      httpMetadata: { contentType: mime },
    });
    try {
      await run(
        "INSERT INTO uploads(id,user_id,mime,created_at) VALUES(?,?,?,?)",
        uid,
        user.id,
        mime,
        now(),
      );
    } catch (e) {
      await env.BUCKET!.delete(uid);
      throw e;
    }
    return json({ id: uid }, 201);
  }
  if (method === "GET" && key) {
    const item = await one<{
      post_id: string | null;
      user_id: string;
      mime: string;
      hidden: number | null;
    }>(
      "SELECT i.*,p.hidden FROM uploads i LEFT JOIN posts p ON p.id=i.post_id WHERE i.id=?",
      key,
    );
    if (!item) fail("图片不存在", 404);
    if (!item.post_id || item.hidden) {
      const user = await getUser(req);
      if (!user || (user.id !== item.user_id && user.role !== "admin"))
        fail("图片不存在", 404);
    }
    const file = await env.BUCKET!.get(key);
    if (!file) fail("图片不存在", 404);
    return new Response(file.body, {
      headers: {
        "Content-Type": item.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
