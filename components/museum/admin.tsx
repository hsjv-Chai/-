"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Eye, ImagePlus, Plus, Save, X } from "lucide-react";
import { api } from "../community/client";
import { useData } from "../community/use-data";
import { Link, Loading, ErrorBox } from "../community/display";
import type { User } from "../community/types";
import { blankExhibition, blankItem, type ExhibitionDraft, type ExhibitionEditor, type ItemDraft } from "@/lib/museum/model";
import { appPath } from "@/lib/paths";
import { museumImage } from "./view";

const endpoint = "admin/museum/exhibitions";
const canManage = (user: User | null) => user?.role === "admin" && user.account_status === "active";

export function MuseumAdminList({ user, ready = true }: { user: User | null; ready?: boolean }) {
  const [page, setPage] = useState(1), [attempt, setAttempt] = useState(0), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const resource = useData<{ items: { id: string; title: string; status: string; revision: number }[]; total: number; page: number }>(canManage(user) ? endpoint + "?page=" + page : null, attempt);
  if (!ready) return <Loading />;
  if (!canManage(user)) return <ErrorBox message="博物馆策展仅限状态正常的管理员" />;
  return <section className="museum-admin-list">
    <div className="museum-admin-heading"><div><h2>博物馆策展</h2><p>编辑草稿，预览后整展发布。公开内容与草稿相互独立。</p></div><button className="museum-button" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { const data = await api<ExhibitionEditor>(endpoint, { method: "POST", body: JSON.stringify({ draft: blankExhibition() }) }); window.location.assign(appPath("/admin/museum/" + data.id)); }
      catch (e) { setError((e as Error).message); setBusy(false); }
    }}><Plus size={17} />新建展览</button></div>
    <ErrorBox message={error || resource.error} />
    {resource.error && <button className="museum-button secondary" onClick={() => setAttempt(n => n + 1)}>重新加载</button>}
    {resource.loading ? <Loading /> : resource.data?.items.length ? <div className="museum-admin-rows">{resource.data.items.map(item => <div key={item.id}><div><span className="museum-status">{{ draft: "草稿", published: "公开中", offline: "已下架" }[item.status]}</span><h3>{item.title || "未命名展览"}</h3><small>草稿版本 {item.revision}</small></div><Link href={"/admin/museum/" + item.id}>编辑与预览<ArrowUpRight size={16} /></Link></div>)}</div> : !resource.error && <p className="museum-admin-empty">还没有展览，从一份新草稿开始。</p>}
    {resource.data && resource.data.total > 20 && <div className="museum-admin-pages"><button disabled={page <= 1} onClick={() => setPage(n => n - 1)}>上一页</button><span>{page} / {Math.ceil(resource.data.total / 20)}</span><button disabled={page * 20 >= resource.data.total} onClick={() => setPage(n => n + 1)}>下一页</button></div>}
  </section>;
}

export function MuseumEditor({ id, user, ready }: { id: string; user: User | null; ready: boolean }) {
  const [attempt, setAttempt] = useState(0);
  const resource = useData<ExhibitionEditor>(canManage(user) ? endpoint + "/" + id : null, attempt);
  const [editor, setEditor] = useState<ExhibitionEditor | null>(null), [draft, setDraft] = useState(blankExhibition);
  const [selected, setSelected] = useState<string | null>(null), [item, setItem] = useState(blankItem);
  const [dirty, setDirty] = useState(false), [itemDirty, setItemDirty] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState(""), [conflict, setConflict] = useState(false);
  const [previewed, setPreviewed] = useState<number | null>(null), [confirmed, setConfirmed] = useState(false);
  const [unpublishConfirm, setUnpublishConfirm] = useState(false);
  const writing = useRef(false), itemSection = useRef<HTMLElement>(null);
  useEffect(() => { if (resource.data) { setEditor(resource.data); setDraft(resource.data.draft); } }, [resource.data]);
  useEffect(() => {
    if (!dirty && !itemDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, itemDirty]);
  const changed = () => { setPreviewed(null); setConfirmed(false); setUnpublishConfirm(false); setMessage(""); };
  function updateDraft<K extends keyof ExhibitionDraft>(key: K, value: ExhibitionDraft[K]) { setDraft(d => ({ ...d, [key]: value })); setDirty(true); changed(); }
  function updateItem<K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) { setItem(d => ({ ...d, [key]: value })); setItemDirty(true); changed(); }
  async function perform(action: () => Promise<void>) {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (e) { setError((e as Error).message); if ((e as { status?: number }).status === 409) setConflict(true); }
    finally { writing.current = false; setBusy(false); }
  }
  async function saveDraft(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    await perform(async () => {
      const result = await api<{ revision: number }>(`${endpoint}/${id}`, { method: "PATCH", body: JSON.stringify({ revision: editor.revision, draft }) });
      setEditor({ ...editor, revision: result.revision, draft }); setDirty(false); changed(); setMessage("展览资料已保存为草稿，公开版未改变。");
    });
  }
  async function saveItem(event: FormEvent) {
    event.preventDefault(); if (!editor || !selected) return;
    await perform(async () => {
      const isNew = selected === "new";
      const result = await api<{ id?: string; revision: number }>(`${endpoint}/${id}/items` + (isNew ? "" : "/" + selected), { method: isNew ? "POST" : "PATCH", body: JSON.stringify({ revision: editor.revision, item }) });
      const key = isNew ? result.id! : selected;
      setEditor({ ...editor, revision: result.revision, items: isNew ? [...editor.items, { ...item, id: key, position: (editor.items.at(-1)?.position ?? -1) + 1 }] : editor.items.map(old => old.id === key ? { ...old, ...item } : old) });
      setSelected(null); setItemDirty(false); changed(); setMessage("展品已保存到草稿。");
    });
  }
  async function upload(files: FileList | null, cover: boolean) {
    if (!files?.length) return;
    if (!cover && item.images.length + files.length > 9) { setError("每件展品最多上传 9 张图片"); return; }
    await perform(async () => {
      for (const file of Array.from(files).slice(0, cover ? 1 : 9)) {
        if (file.size > 5 * 1024 * 1024) throw new Error("每张图片不能超过 5 MB");
        const form = new FormData(); form.append("file", file);
        const image = await api<{ id: string }>(`${endpoint}/${id}/images`, { method: "POST", body: form });
        if (cover) { setDraft(old => ({ ...old, cover: image.id, coverAlt: "" })); setDirty(true); }
        else { setItem(old => ({ ...old, images: [...old.images, { id: image.id, alt: "", caption: "" }] })); setItemDirty(true); }
        changed();
      }
      setMessage("图片已上传，补充说明后请保存草稿。");
    });
  }
  function chooseItem(key: string) {
    if (itemDirty && !window.confirm("放弃尚未保存的展品修改？")) return;
    setSelected(key); setItem(key === "new" ? blankItem() : editor!.items.find(item => item.id === key)!); setItemDirty(false);
    requestAnimationFrame(() => itemSection.current?.scrollIntoView({ behavior: "auto", block: "start" }));
  }
  if (!ready) return <Loading />;
  if (!canManage(user)) return <ErrorBox message="博物馆策展仅限状态正常的管理员" />;
  if (!editor) return resource.error ? <><ErrorBox message={resource.error} /><button className="museum-button" onClick={() => setAttempt(n => n + 1)}>重新加载</button></> : <Loading />;
  return <div className="museum-editor">
    <Link className="museum-back" href="/admin/museum"><ArrowLeft size={16} />展览管理</Link>
    <header className="museum-admin-heading"><div><span className="museum-kicker">管理员策展</span><h1>{editor.draft.title || "新展览草稿"}</h1><p>版本 {editor.revision} · {editor.isPublic ? "已有公开版，编辑只影响草稿" : editor.publishedAt ? "已下架，草稿与历史公开版保留" : "尚未公开"}</p></div></header>
    <div className="museum-editor-feedback" aria-live="polite"><ErrorBox message={error} />{message && <p role="status">{message}</p>}{conflict && <button className="museum-button secondary" disabled={busy} onClick={() => {
      if (!window.confirm("重新加载会放弃本页尚未保存的内容，是否继续？")) return;
      setDirty(false); setItemDirty(false); setSelected(null); setEditor(null); setConflict(false); setError(""); changed(); setAttempt(n => n + 1);
    }}>重新加载已保存草稿</button>}</div>
    <fieldset disabled={busy} className="museum-editor-fields">
      <form onSubmit={saveDraft} className="museum-form-section">
        <h2>展览资料</h2><label>展览标题<input maxLength={100} value={draft.title} onChange={event => updateDraft("title", event.target.value)} /></label>
        <label>简介<textarea maxLength={300} rows={2} value={draft.summary} onChange={event => updateDraft("summary", event.target.value)} /></label>
        <label>策展介绍 · Markdown<textarea maxLength={20000} rows={6} value={draft.body} onChange={event => updateDraft("body", event.target.value)} /></label>
        <div className="museum-cover-editor">{draft.cover && <img src={museumImage(draft.cover)} alt={draft.coverAlt || "待补充说明的草稿封面"} />}<label className="museum-upload"><ImagePlus size={18} />{draft.cover ? "更换封面" : "上传展览封面"}<input type="file" aria-label="上传展览封面" accept="image/jpeg,image/png,image/webp" onChange={event => { void upload(event.target.files, true); event.target.value = ""; }} /></label></div>
        <label>封面说明<input maxLength={200} value={draft.coverAlt} onChange={event => updateDraft("coverAlt", event.target.value)} /></label>
        <button className="museum-button" disabled={!dirty} type="submit"><Save size={17} />保存展览草稿</button><span className="museum-save-hint">{dirty ? "展览资料尚未保存" : "展览资料已保存"}</span>
      </form>
      <section className="museum-form-section"><div className="museum-admin-heading"><h2>展品 · {editor.items.length} 件</h2><button type="button" className="museum-button secondary" onClick={() => chooseItem("new")}><Plus size={17} />添加展品</button></div>
        {!editor.items.length && <p>还没有展品。允许先保存空草稿，至少补齐一件展品后再发布。</p>}
        <ol className="museum-edit-items">{editor.items.map((entry, index) => <li key={entry.id}><span>{String(index + 1).padStart(2, "0")}</span><button className="museum-edit-title" onClick={() => chooseItem(entry.id)} type="button">{entry.title || "未命名展品"}</button><div className="museum-item-actions">{[[-1, "上移", ArrowUp], [1, "下移", ArrowDown]].map(([offset, label, Icon]) => {
          const delta = offset as number, Symbol = Icon as typeof ArrowUp;
          return <button key={String(label)} type="button" aria-label={String(label) + (entry.title || "未命名展品")} disabled={index + delta < 0 || index + delta >= editor.items.length} onClick={() => void perform(async () => {
            const items = editor.items.slice(); [items[index], items[index + delta]] = [items[index + delta], items[index]];
            const result = await api<{ revision: number }>(`${endpoint}/${id}/reorder`, { method: "POST", body: JSON.stringify({ revision: editor.revision, ids: items.map(item => item.id) }) });
            setEditor({ ...editor, revision: result.revision, items: items.map((item, position) => ({ ...item, position })) }); changed(); setMessage("展品草稿顺序已更新。");
          })}><Symbol size={17} /></button>;
        })}<button type="button" aria-label={"移出草稿：" + entry.title} onClick={() => {
          if (!window.confirm("从草稿移出此展品？当前公开版不变，下次发布后才会移除。")) return;
          void perform(async () => { const result = await api<{ revision: number }>(`${endpoint}/${id}/items/${entry.id}`, { method: "DELETE", body: JSON.stringify({ revision: editor.revision }) }); setEditor({ ...editor, revision: result.revision, items: editor.items.filter(item => item.id !== entry.id) }); if (selected === entry.id) { setSelected(null); setItemDirty(false); } changed(); setMessage("展品已从草稿移出。"); });
        }}><X size={17} /></button></div></li>)}</ol>
      </section>
      {selected && <section className="museum-form-section" ref={itemSection}><form onSubmit={saveItem}>
        <h2>{selected === "new" ? "新展品" : "编辑展品"}</h2>
        <label>展品标题<input maxLength={100} value={item.title} onChange={event => updateItem("title", event.target.value)} /></label>
        <label>展品介绍 · Markdown<textarea maxLength={20000} rows={8} value={item.body} onChange={event => updateItem("body", event.target.value)} /></label>
        <div className="museum-optional-fields">{([["maker", "作者"], ["era", "年代"], ["source", "来源"]] as const).map(([key, label]) => <label key={key}>{label}（选填）<input maxLength={key === "source" ? 300 : 100} value={item[key]} onChange={event => updateItem(key, event.target.value)} /></label>)}</div>
        <p className="museum-save-hint">图片最多 9 张，每张不超过 5 MB；请填写能描述画面的图片说明。</p>
        <div className="museum-image-editors">{item.images.map((image, index) => <div key={image.id}><img src={museumImage(image.id)} alt={image.alt || "草稿图片"} /><div><label>图片 {index + 1} 说明<input maxLength={200} value={image.alt} onChange={event => updateItem("images", item.images.map((old, i) => i === index ? { ...old, alt: event.target.value } : old))} /></label><label>图注（选填）<input maxLength={500} value={image.caption} onChange={event => updateItem("images", item.images.map((old, i) => i === index ? { ...old, caption: event.target.value } : old))} /></label><button className="museum-text-button" type="button" onClick={() => updateItem("images", item.images.filter((_, i) => i !== index))}>移除这张图片</button></div></div>)}</div>
        <label className="museum-upload"><ImagePlus size={18} />上传展品图片<input type="file" aria-label="上传展品图片" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { void upload(event.target.files, false); event.target.value = ""; }} /></label>
        <div className="museum-form-actions"><button className="museum-button" type="submit"><Save size={17} />保存展品草稿</button><button type="button" className="museum-button secondary" onClick={() => { if (!itemDirty || window.confirm("放弃尚未保存的展品修改？")) { setSelected(null); setItemDirty(false); } }}>取消编辑</button></div>
      </form></section>}
      <section className="museum-form-section museum-publish-panel"><h2>预览与公开</h2><p>发布会一次更新整场展览。草稿图片、介绍和排序均以已保存版本为准。</p>
        {dirty || itemDirty ? <p className="museum-unsaved">请先保存或取消尚未保存的修改，再预览和发布。</p> : <Link className="museum-button secondary" href={"/museum/preview/" + id} target="_blank" rel="noopener noreferrer" onClick={() => { setPreviewed(editor.revision); setConfirmed(false); }}><Eye size={17} />预览已保存草稿<ArrowUpRight size={16} /></Link>}
        <label className="museum-publish-confirm"><input type="checkbox" checked={confirmed} disabled={dirty || itemDirty || previewed !== editor.revision} onChange={event => setConfirmed(event.target.checked)} />我已预览版本 {editor.revision}，确认本次公开内容</label>
        <div className="museum-form-actions"><button className="museum-button" type="button" disabled={dirty || itemDirty || !confirmed || previewed !== editor.revision || conflict} onClick={() => void perform(async () => {
          const result = await api<{ revision: number }>(`${endpoint}/${id}/publish`, { method: "POST", body: JSON.stringify({ revision: editor.revision }) });
          setEditor({ ...editor, revision: result.revision, isPublic: true, publishedAt: Date.now() }); changed(); setMessage("整场展览已公开。");
        })}>{editor.isPublic ? "更新公开版" : "发布展览"}</button>
        <button className="museum-button secondary" type="button" disabled={!editor.isPublic || conflict} onClick={() => setUnpublishConfirm(true)}>下架展览</button>{editor.isPublic && <Link href={"/museum/exhibitions/" + id} target="_blank" rel="noopener noreferrer" className="museum-text-button">查看公开版<ArrowUpRight size={16} /></Link>}</div>
        {unpublishConfirm && <div className="museum-unpublish-confirm" role="group" aria-label="确认下架展览"><p>下架后游客将无法访问展览、展品及专属图片，草稿和已发布版本会保留。</p><div className="museum-form-actions"><button className="museum-button" type="button" onClick={() => void perform(async () => {
          const result = await api<{ revision: number }>(`${endpoint}/${id}/unpublish`, { method: "POST", body: JSON.stringify({ revision: editor.revision }) }); setEditor({ ...editor, revision: result.revision, isPublic: false }); changed(); setMessage("展览已下架，草稿和已发布版本保留。");
        })}>确认下架</button><button className="museum-button secondary" type="button" onClick={() => setUnpublishConfirm(false)}>取消下架</button></div></div>}
      </section>
    </fieldset>
  </div>;
}
