"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Copy, Landmark, Search, X } from "lucide-react";
import Markdown from "../markdown";
import { Link, Loading, ErrorBox, Empty } from "../community/display";
import { useData } from "../community/use-data";
import { appPath } from "@/lib/paths";
import type { User } from "../community/types";
import type { Exhibition, ExhibitionEditor, MuseumImage, MuseumItem } from "@/lib/museum/model";

export const museumImage = (id: string) => appPath("/api/museum/images/" + id);
type ItemView = { item: MuseumItem; exhibition: { id: string; title: string }; previous: { id: string; title: string } | null; next: { id: string; title: string } | null };
type ExhibitionView = { exhibition: Exhibition; items: MuseumItem[]; total: number; page: number };
type IndexView = { items: Exhibition[]; total: number; page: number };

function Share() {
  const [message, setMessage] = useState("");
  return <div className="museum-share"><button onClick={async () => {
    try { await navigator.clipboard.writeText(window.location.href); setMessage("链接已复制"); }
    catch { setMessage("复制失败，请复制浏览器地址栏中的链接"); }
  }}>{message === "链接已复制" ? <Check size={16} /> : <Copy size={16} />}分享链接</button><span role="status">{message}</span></div>;
}

function ImageViewer({ images, start, close }: { images: MuseumImage[]; start: number; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null), [index, setIndex] = useState(start);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} className="museum-lightbox" aria-label="展品图片查看" onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }} onKeyDown={event => {
    if (event.key === "ArrowLeft") setIndex(n => Math.max(0, n - 1));
    if (event.key === "ArrowRight") setIndex(n => Math.min(images.length - 1, n + 1));
  }}>
    <div className="museum-lightbox-tools"><span>{index + 1} / {images.length}</span><button onClick={close} aria-label="关闭图片"><X size={22} /></button></div>
    <img src={museumImage(images[index].id)} alt={images[index].alt} />
    <p>{images[index].caption || images[index].alt}</p>
    <div className="museum-lightbox-arrows"><button disabled={index === 0} onClick={() => setIndex(n => n - 1)} aria-label="上一张图片"><ArrowLeft /></button><button disabled={index === images.length - 1} onClick={() => setIndex(n => n + 1)} aria-label="下一张图片"><ArrowRight /></button></div>
  </dialog>;
}

export function MuseumPagination({ page, total, size, href }: { page: number; total: number; size: number; href: (page: number) => string }) {
  if (total <= size) return null;
  return <nav className="museum-pagination" aria-label="博物馆分页">
    {page > 1 ? <Link href={href(page - 1)}><ArrowLeft size={16} />上一页</Link> : <span />}
    <span>{page} / {Math.ceil(total / size)}</span>
    {page < Math.ceil(total / size) ? <Link href={href(page + 1)}>下一页<ArrowRight size={16} /></Link> : <span />}
  </nav>;
}

function Exhibit({ data, previewId }: { data: ItemView; previewId?: string }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const { item, exhibition, previous, next } = data;
  const itemHref = (id: string) => previewId ? `/museum/preview/${previewId}?item=${id}` : `/museum/items/${id}`;
  return <article className="museum-item-detail">
    <Link className="museum-back" href={previewId ? "/museum/preview/" + previewId : "/museum/exhibitions/" + exhibition.id}><ArrowLeft size={16} />{exhibition.title}</Link>
    <header className="museum-item-heading"><span className="museum-kicker">展品档案</span><h1>{item.title}</h1>{!previewId && <Share />}</header>
    <div className="museum-item-layout"><div className="museum-gallery">{item.images.map((image, index) => <figure key={image.id}>
      <button className="museum-image-button" onClick={() => setZoom(index)} aria-label={"放大图片：" + image.alt}><img src={museumImage(image.id)} alt={image.alt} loading={index ? "lazy" : "eager"} /><span>查看原图<ArrowUpRight size={16} /></span></button>
      {image.caption && <figcaption>{image.caption}</figcaption>}
    </figure>)}</div><div className="museum-item-copy">
      {(item.maker || item.era || item.source) && <dl className="museum-facts">{[["作者", item.maker], ["年代", item.era], ["来源", item.source]].map(([label, value]) => value && <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
      <Markdown text={item.body} />
    </div></div>
    <nav className="museum-neighbors" aria-label="相邻展品">{previous ? <Link href={itemHref(previous.id)}><small>上一件</small><span><ArrowLeft size={16} />{previous.title}</span></Link> : <span />}{next ? <Link href={itemHref(next.id)}><small>下一件</small><span>{next.title}<ArrowRight size={16} /></span></Link> : <span />}</nav>
    {zoom !== null && <ImageViewer images={item.images} start={zoom} close={() => setZoom(null)} />}
  </article>;
}

function ExhibitionPage({ data, previewId }: { data: ExhibitionView; previewId?: string }) {
  const { exhibition, items, total, page } = data;
  return <article>
    <Link className="museum-back" href="/museum"><ArrowLeft size={16} />全部展览</Link>
    <header className="museum-exhibition-heading"><span className="museum-kicker">主题展览 · {total} 件展品</span><h1>{exhibition.title || "未命名展览"}</h1><p>{exhibition.summary}</p>{!previewId && <Share />}</header>
    {exhibition.cover && <figure className="museum-exhibition-cover"><img src={museumImage(exhibition.cover)} alt={exhibition.coverAlt || "草稿封面"} /></figure>}
    {exhibition.body && <div className="museum-curatorial"><span className="museum-kicker">策展手记</span><Markdown text={exhibition.body} /></div>}
    <div className="museum-section-heading"><h2>展品陈列</h2><span>循着细节，继续发现</span></div>
    {items.length ? <div className="museum-grid">{items.map((item, index) => <Link className="museum-tile" key={item.id} href={previewId ? `/museum/preview/${previewId}?item=${item.id}` : "/museum/items/" + item.id}>
      <div className="museum-tile-image">{item.images[0] ? <img src={museumImage(item.images[0].id)} alt={item.images[0].alt || item.title} loading="lazy" /> : <span>待添加图片</span>}</div>
      <div className="museum-tile-label"><span>展品 {String((page - 1) * 20 + index + 1).padStart(2, "0")}</span><ArrowUpRight size={18} /></div><h3>{item.title || "未命名展品"}</h3><p>{[item.maker, item.era].filter(Boolean).join(" · ") || "图文展品"}</p>
    </Link>)}</div> : <Empty title="展品正在布置中">这里还没有展品。</Empty>}
    {!previewId && <MuseumPagination page={page} total={total} size={20} href={n => `/museum/exhibitions/${exhibition.id}?page=${n}`} />}
  </article>;
}

export function MuseumView({ path, params, user, ready }: { path: string[]; params: string; user: User | null; ready: boolean }) {
  const [attempt, setAttempt] = useState(0), query = new URLSearchParams(params);
  const preview = path[0] === "preview" && path.length === 2;
  const valid = !path.length || (path.length === 2 && ["exhibitions", "items", "preview"].includes(path[0]));
  const blocked = preview && (!ready || user?.role !== "admin" || user.account_status !== "active");
  const endpoint = !valid || blocked ? null : preview ? `admin/museum/exhibitions/${path[1]}/preview` : !path.length ? "museum/exhibitions?" + params : "museum/" + path.join("/") + "?" + params;
  const resource = useData<IndexView | ExhibitionView | ItemView | ExhibitionEditor>(endpoint, attempt);
  if (!valid) return <Empty title="这个展厅不存在"><Link href="/museum">返回博物馆</Link></Empty>;
  if (preview && !ready) return <Loading />;
  if (blocked) return <ErrorBox message="草稿预览仅限状态正常的管理员" />;
  if (resource.error) return <div className="museum-failure"><ErrorBox message={resource.error} /><button className="museum-button" onClick={() => setAttempt(n => n + 1)}>重新加载</button><Link href="/museum">返回博物馆</Link></div>;
  if (resource.loading || !resource.data) return <div className="museum-loading"><Loading /><div /><div /></div>;
  if (preview) {
    const editor = resource.data as ExhibitionEditor, selected = editor.items.find(item => item.id === query.get("item"));
    const index = selected ? editor.items.indexOf(selected) : -1;
    return <><div className="museum-preview-notice"><strong>草稿预览 · 仅管理员可见</strong><span>版本 {editor.revision}，尚未影响公开页面</span><Link href={"/admin/museum/" + editor.id}>返回编辑<ArrowRight size={16} /></Link></div>
      {query.get("item") && !selected ? <Empty title="草稿中不存在这件展品" /> : selected ? <Exhibit key={selected.id} previewId={editor.id} data={{ item: selected, exhibition: { id: editor.id, title: editor.draft.title }, previous: editor.items[index - 1] || null, next: editor.items[index + 1] || null }} />
        : <ExhibitionPage previewId={editor.id} data={{ exhibition: { ...editor.draft, id: editor.id, publishedAt: 0, count: editor.items.length }, items: editor.items, total: editor.items.length, page: 1 }} />}</>;
  }
  if (path[0] === "items") return <Exhibit key={path[1]} data={resource.data as ItemView} />;
  if (path[0] === "exhibitions") return <ExhibitionPage data={resource.data as ExhibitionView} />;
  const { items, total, page } = resource.data as IndexView, [lead, ...rest] = items;
  return <>
    <header className="museum-masthead"><div><span className="museum-kicker"><Landmark size={16} />🍉 博物馆</span><h1>把值得看的，<br />留在这里<span>。</span></h1><p>在图像与文字之间，发现物件的故事。</p></div><p className="museum-intro-note">每一场展览，<br />都是一次新的观察。</p></header>
    <div className="museum-index-toolbar"><h2>{query.get("q") ? "搜索结果" : "正在展出"}<span>{total} 场展览</span></h2><form role="search" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); window.location.assign(appPath("/museum?q=" + encodeURIComponent(String(form.get("q") || "")))); }}><Search size={18} /><input name="q" defaultValue={query.get("q") || ""} aria-label="搜索展览" placeholder="搜索展览标题或简介" /><button aria-label="提交展览搜索"><ArrowRight size={18} /></button></form></div>
    {lead ? <><Link className="museum-lead" href={"/museum/exhibitions/" + lead.id}><div className="museum-lead-image"><img src={museumImage(lead.cover)} alt={lead.coverAlt} /></div><div className="museum-lead-copy"><span className="museum-kicker">{page === 1 && !query.get("q") ? "最新主展" : "主题展览"} · {lead.count} 件展品</span><h2>{lead.title}</h2><p>{lead.summary}</p><span className="museum-enter">走进展览<ArrowUpRight size={19} /></span></div></Link>
      {!!rest.length && <div className="museum-grid museum-index-grid">{rest.map(exhibition => <Link className="museum-tile" href={"/museum/exhibitions/" + exhibition.id} key={exhibition.id}><div className="museum-tile-image"><img src={museumImage(exhibition.cover)} alt={exhibition.coverAlt} loading="lazy" /></div><div className="museum-tile-label"><span>{exhibition.count} 件展品</span><ArrowUpRight size={18} /></div><h3>{exhibition.title}</h3><p>{exhibition.summary}</p></Link>)}</div>}
      <MuseumPagination page={page} total={total} size={12} href={n => "/museum?" + new URLSearchParams({ q: query.get("q") || "", page: String(n) })} />
    </> : <Empty title={query.get("q") ? "没有找到相关展览" : "第一场展览，正在酝酿"}>{query.get("q") ? "换个关键词，或返回全部展览。" : "展览公开后，会在这里与你见面。"}{query.get("q") && <Link className="museum-back" href="/museum">全部展览<ArrowRight size={16} /></Link>}</Empty>}
    <footer className="museum-end"><Landmark size={19} /><p>🍉 博物馆 · 用好奇心，看见更多。</p><Link href="/">回到话题广场<ArrowUpRight size={16} /></Link></footer>
  </>;
}
