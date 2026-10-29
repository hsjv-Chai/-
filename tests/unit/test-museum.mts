import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { blankExhibition, blankItem, exhibitionDraft, itemDraft, validatePublication } from "../../lib/museum/model.ts";

test("drafts accept incomplete content; publication requires complete exhibition and exhibits", () => {
  assert.deepEqual(exhibitionDraft(blankExhibition()), blankExhibition());
  assert.deepEqual(itemDraft(blankItem()), blankItem());
  assert.throws(() => validatePublication(blankExhibition(), []), /发布前/);
  const exhibition = { ...blankExhibition(), title: "展览", summary: "简介", cover: "image", coverAlt: "封面说明" };
  assert.throws(() => validatePublication(exhibition, []), /至少/);
  const item = { ...blankItem(), id: "item", position: 0, title: "展品", body: "介绍", images: [{ id: "image", alt: "画面说明", caption: "" }] };
  validatePublication(exhibition, [item]);
  assert.throws(() => validatePublication(exhibition, [{ ...item, images: [{ id: "image", alt: "", caption: "" }] }]), /补齐/);
});
test("museum input limits reject malformed and duplicate image references without rendering HTML", () => {
  for (const invalid of [null, [], "string"]) assert.throws(() => exhibitionDraft(invalid));
  assert.throws(() => exhibitionDraft({ ...blankExhibition(), title: "字".repeat(101) }));
  assert.throws(() => itemDraft({ ...blankItem(), images: Array.from({ length: 10 }, (_, n) => ({ id: String(n), alt: "图", caption: "" })) }));
  assert.throws(() => itemDraft({ ...blankItem(), images: [{ id: "a", alt: "", caption: "" }, { id: "a", alt: "", caption: "" }] }));
  assert.equal(itemDraft({ ...blankItem(), images: Array.from({ length: 9 }, (_, n) => ({ id: String(n), alt: "图", caption: "" })) }).images.length, 9);
  assert.equal(itemDraft({ ...blankItem(), body: "<script>text</script>" }).body, "<script>text</script>");
});
test("museum migration adds empty tables without altering legacy accounts or forum content", () => {
  const db = new DatabaseSync(":memory:"); db.exec("PRAGMA foreign_keys=ON");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  for (const entry of journal.entries.slice(0, -1)) db.exec(readFileSync(`drizzle/${entry.tag}.sql`, "utf8"));
  db.prepare("INSERT INTO users(id,username,nickname,password,created_at) VALUES('legacy','legacy','历史账户','hash',123)").run();
  db.prepare("INSERT INTO categories VALUES('c','分区','说明')").run();
  db.prepare("INSERT INTO posts(id,user_id,category_id,title,body,created_at,updated_at) VALUES('p','legacy','c','原帖','正文',123,123)").run();
  const before = [db.prepare("SELECT * FROM users").all(), db.prepare("SELECT * FROM posts").all()];
  db.exec(readFileSync(`drizzle/${journal.entries.at(-1).tag}.sql`, "utf8"));
  assert.deepEqual([db.prepare("SELECT * FROM users").all(), db.prepare("SELECT * FROM posts").all()], before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM museum_exhibitions").get()!.n, 0);
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []); db.close();
});
