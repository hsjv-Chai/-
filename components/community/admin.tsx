"use client";

import { type User, type Post, type Reply } from "./types";
import { useData } from "./use-data";
import { useState } from "react";
import { api } from "./client";
import { Loading, ErrorBox, relative, Link } from "./display";
import { Sparkles, Pin, Eye, ArrowUpRight } from "lucide-react";

export function Admin({
  user,
  ready,
  version,
  refresh,
  notify,
}: {
  user: User | null;
  ready: boolean;
  version: number;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const { data, error, loading } = useData<{ posts: Post[]; replies: Reply[] }>(
      user?.role === "admin" ? "admin" : null,
      version,
    ),
    [tab, setTab] = useState("posts"),
    [busy, setBusy] = useState(false);
  async function update(
    type: string,
    id: string,
    field: string,
    value: boolean,
  ) {
    setBusy(true);
    try {
      await api(`admin/${type}/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ field, value }),
      });
      refresh();
      notify("社区内容已更新");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <Loading />;
  if (user?.role !== "admin")
    return <ErrorBox message="此页面仅管理员可访问" />;
  return (
    <section className="admin-card">
      <div className="eyebrow">KEEP THE CONVERSATION GOOD</div>
      <h1>社区管理</h1>
      <p className="muted">给好讨论一个更显眼的位置。最多置顶 3 条。</p>
      <div className="profile-tabs">
        <button
          className={tab === "posts" ? "active" : ""}
          onClick={() => setTab("posts")}
        >
          话题
        </button>
        <button
          className={tab === "replies" ? "active" : ""}
          onClick={() => setTab("replies")}
        >
          回复
        </button>
      </div>
      <ErrorBox message={error} />
      {loading && !data ? (
        <Loading />
      ) : tab === "posts" ? (
        data?.posts.map((p) => (
          <div
            className={"admin-item " + (p.hidden ? "is-hidden" : "")}
            key={p.id}
          >
            <span className="admin-item-state">
              {p.hidden ? "已隐藏" : "公开"}
            </span>
            <h3>{p.title}</h3>
            <small>
              {p.nickname} · {relative(p.created_at)}
            </small>
            <div className="admin-actions">
              <button
                disabled={busy}
                className={p.featured ? "active" : ""}
                onClick={() => update("posts", p.id, "featured", !p.featured)}
              >
                <Sparkles size={13} />
                {p.featured ? "取消精选" : "设为精选"}
              </button>
              <button
                disabled={busy}
                className={p.pinned ? "active" : ""}
                onClick={() => update("posts", p.id, "pinned", !p.pinned)}
              >
                <Pin size={13} />
                {p.pinned ? "取消置顶" : "置顶"}
              </button>
              <button
                disabled={busy}
                onClick={() => update("posts", p.id, "hidden", !p.hidden)}
              >
                <Eye size={13} />
                {p.hidden ? "恢复显示" : "隐藏"}
              </button>
              {!p.hidden && (
                <Link href={"/p/" + p.id}>
                  查看
                  <ArrowUpRight size={13} />
                </Link>
              )}
            </div>
          </div>
        ))
      ) : (
        data?.replies.map((r) => (
          <div
            className={"admin-item " + (r.hidden ? "is-hidden" : "")}
            key={r.id}
          >
            <span className="admin-item-state">
              {r.hidden ? "已隐藏" : "公开"}
            </span>
            <small>
              {r.nickname} · {r.title}
            </small>
            <p>{r.body}</p>
            <button
              disabled={busy}
              className="text-link"
              onClick={() => update("replies", r.id, "hidden", !r.hidden)}
            >
              {r.hidden ? "恢复显示" : "隐藏回复"}
            </button>
          </div>
        ))
      )}
    </section>
  );
}
