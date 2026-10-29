// Portable presentation types and validation; never import storage from this module.
export type MuseumImage = { id: string; alt: string; caption: string };
export type ExhibitionDraft = { title: string; summary: string; body: string; cover: string; coverAlt: string };
export type ItemDraft = { title: string; body: string; maker: string; era: string; source: string; images: MuseumImage[] };
export type MuseumItem = ItemDraft & { id: string; position: number };
export type Exhibition = ExhibitionDraft & { id: string; publishedAt: number; count: number };
export type ExhibitionEditor = { id: string; revision: number; draft: ExhibitionDraft; items: MuseumItem[]; isPublic: boolean; publishedAt: number | null };
export const blankExhibition = (): ExhibitionDraft => ({ title: "", summary: "", body: "", cover: "", coverAlt: "" });
export const blankItem = (): ItemDraft => ({ title: "", body: "", maker: "", era: "", source: "", images: [] });
function invalid(message: string): never { throw Object.assign(new Error(message), { status: 400 }); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid("草稿格式错误");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || value.trim().length > max) invalid(`${label}不能超过 ${max} 个字符`);
  return value.trim();
}
export function exhibitionDraft(value: unknown): ExhibitionDraft {
  const b = record(value);
  return { title: text(b.title, "展览标题", 100), summary: text(b.summary, "展览简介", 300), body: text(b.body, "策展介绍", 20000), cover: text(b.cover, "封面", 100), coverAlt: text(b.coverAlt, "封面说明", 200) };
}
export function itemDraft(value: unknown): ItemDraft {
  const b = record(value);
  if (!Array.isArray(b.images) || b.images.length > 9) invalid("每件展品最多上传 9 张图片");
  const images = b.images.map(value => {
    const image = record(value);
    const id = text(image.id, "图片编号", 100);
    if (!id) invalid("图片编号不能为空");
    return { id, alt: text(image.alt, "图片说明", 200), caption: text(image.caption, "图片图注", 500) };
  });
  if (new Set(images.map(image => image.id)).size !== images.length) invalid("不能重复选择同一张图片");
  return { title: text(b.title, "展品标题", 100), body: text(b.body, "展品介绍", 20000), maker: text(b.maker, "作者", 100), era: text(b.era, "年代", 100), source: text(b.source, "来源", 300), images };
}
export function validatePublication(draft: ExhibitionDraft, items: MuseumItem[]) {
  if (!draft.title || !draft.summary || !draft.cover || !draft.coverAlt) invalid("发布前请填写展览标题、简介、封面及封面说明");
  if (!items.length) invalid("至少添加一件展品后才能发布");
  for (const item of items) {
    if (!item.title || !item.body || !item.images.length || item.images.some(image => !image.alt))
      invalid("发布前请补齐每件展品的标题、介绍、图片及图片说明");
  }
}
