import { all, one, db, fail, id, now, type User } from "@/lib/server";
import type { Statement } from "@/lib/storage-contract";
import type { ExhibitionDraft, ExhibitionEditor, MuseumItem } from "./model";

export type ExhibitionRow = { id: string; draft: string; revision: number; live_release_id: string | null; is_public: number; published_at: number | null };
export const statement = (sql: string, ...values: unknown[]) => db().prepare(sql).bind(...values);
export const tokenGuard = "EXISTS(SELECT 1 FROM museum_exhibitions WHERE id=? AND mutation_token=?)";
export const adminGuard = "EXISTS(SELECT 1 FROM users WHERE id=? AND role='admin' AND account_status='active' AND account_version=?)";
export async function exhibitionRow(key: string) {
  const row = await one<ExhibitionRow>("SELECT * FROM museum_exhibitions WHERE id=?", key);
  if (!row) fail("展览不存在", 404);
  return row;
}
export async function editor(row: ExhibitionRow): Promise<ExhibitionEditor> {
  const items = await all<{ id: string; position: number; content: string }>("SELECT * FROM museum_items WHERE exhibition_id=? AND removed=0 ORDER BY position,id", row.id);
  return { id: row.id, revision: row.revision, draft: JSON.parse(row.draft) as ExhibitionDraft, items: items.map(item => ({ ...JSON.parse(item.content), id: item.id, position: item.position } as MuseumItem)), isPublic: !!row.is_public, publishedAt: row.published_at };
}
export function revision(value: unknown) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) fail("请提供有效的草稿版本号");
  return value as number;
}
// A unique operation token makes every following statement conditional on the CAS.
// db.batch is a transaction in both D1 and Node; a failed CAS writes no other rows.
export async function mutate(user: User, key: string, expected: number, changes: (token: string) => Statement[]) {
  const token = id();
  const result = await db().batch([
    statement(`UPDATE museum_exhibitions SET revision=revision+1,mutation_token=?,updated_at=? WHERE id=? AND revision=? AND ${adminGuard}`, token, now(), key, expected, user.id, user.account_version),
    ...changes(token),
  ]) as { meta: { changes: number } }[];
  if (!result[0]?.meta.changes) {
    const active = await one(`SELECT id FROM users WHERE id=? AND account_version=? AND role='admin' AND account_status='active'`, user.id, user.account_version);
    if (!active) fail("管理员权限已失效，请重新登录", 403);
    fail("草稿已被其他页面更新，请先重新加载；当前输入仍为你保留", 409);
  }
  return expected + 1;
}
export async function checkImages(exhibitionId: string, ids: string[]) {
  for (const key of new Set(ids)) {
    if (!(await one("SELECT id FROM museum_images WHERE id=? AND exhibition_id=?", key, exhibitionId))) fail("图片不属于本展览或已不可用，请重新上传");
  }
}
