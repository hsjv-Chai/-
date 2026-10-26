"use client";

import Markdown from "../markdown";
import { type User, type Detail, type Reply } from "./types";
import { useData } from "./use-data";
import { useState, useRef, type FormEvent } from "react";
import { api } from "./client";
import { Loading, ErrorBox, Link, Avatar, relative } from "./display";
import {
  ArrowLeft,
  Sparkles,
  PenLine,
  Heart,
  MessageCircle,
  Quote,
  X,
  Send,
  ArrowRight,
} from "lucide-react";
import { appPath } from "@/lib/paths";
import { Lightbox } from "./lightbox";

export function PostDetail({
  id,
  user,
  version,
  refresh,
  login,
  notify,
}: {
  id: string;
  user: User | null;
  version: number;
  refresh: () => void;
  login: () => void;
  notify: (s: string) => void;
}) {
  const { data, error, loading } = useData<Detail>("posts/" + id, version);
  const [reply, setReply] = useState(""),
    [quote, setQuote] = useState<Reply | null>(null),
    [busy, setBusy] = useState(false),
    [replyError, setReplyError] = useState(""),
    [lightbox, setLightbox] = useState<string | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  async function like() {
    if (!user) return login();
    setBusy(true);
    try {
      await api("posts/" + id + "/like", {
        method: data?.post.liked ? "DELETE" : "POST",
      });
      refresh();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user) return login();
    setBusy(true);
    setReplyError("");
    try {
      await api("posts/" + id + "/replies", {
        method: "POST",
        body: JSON.stringify({ body: reply, quote_id: quote?.id }),
      });
      setReply("");
      setQuote(null);
      refresh();
      notify("回复已发布");
    } catch (e) {
      setReplyError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (loading && !data) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  const p = data.post;
  return (
    <>
      <Link className="back-link" href="/">
        <ArrowLeft size={16} />
        回到话题广场
      </Link>
      <article className="detail-card">
        <div className="detail-top">
          <Link
            className={"category-tag tag-" + p.category_id}
            href={"/?category=" + p.category_id}
          >
            {p.category_name}
          </Link>
          {!!p.demo && <span className="demo-label">虚构演示话题</span>}
          {!!p.featured && (
            <span className="pin-label">
              <Sparkles size={13} />
              精选
            </span>
          )}
        </div>
        <h1>{p.title}</h1>
        <div className="detail-author">
          <Avatar name={p.nickname} large />
          <div>
            <Link href={"/u/" + p.user_id}>{p.nickname}</Link>
            <small>
              {new Date(p.created_at).toLocaleString("zh-CN")}
              {p.updated_at !== p.created_at ? " · 已编辑" : ""}
            </small>
          </div>
          {user?.id === p.user_id && (
            <Link className="edit-link" href={"/edit/" + p.id}>
              <PenLine size={14} />
              编辑
            </Link>
          )}
        </div>
        <Markdown text={p.body} />
        {data.images.length > 0 && (
          <div
            className={
              "detail-images " + (data.images.length === 1 ? "single" : "")
            }
          >
            {data.images.map((image, i) => (
              <button
                key={image.id}
                onClick={() => setLightbox(image.id)}
                aria-label={"放大第 " + (i + 1) + " 张配图"}
              >
                <img
                  src={appPath("/api/uploads/" + image.id)}
                  alt={"帖子配图 " + (i + 1)}
                />
              </button>
            ))}
          </div>
        )}
        <div className="detail-actions">
          <button
            className={"like-button " + (p.liked ? "liked" : "")}
            onClick={like}
            disabled={busy}
          >
            <Heart size={17} fill={p.liked ? "currentColor" : "none"} />
            {p.liked ? "已喜欢" : "喜欢这条"}
            <b>{p.like_count}</b>
          </button>
          <span>
            <MessageCircle size={16} />
            {p.reply_count} 条讨论
          </span>
        </div>
      </article>
      <section className="replies-card">
        <h2>
          聊聊你的看法 <span>{data.replies.length}</span>
        </h2>
        {data.replies.length === 0 && (
          <p className="first-reply">沙发还空着。来留下第一条回复吧。</p>
        )}
        {data.replies.map((r, i) => (
          <article className="reply" key={r.id}>
            <Avatar name={r.nickname} />
            <div className="reply-main">
              <div className="reply-top">
                <Link href={"/u/" + r.user_id}>{r.nickname}</Link>
                {r.user_id === p.user_id && (
                  <span className="author-badge">楼主</span>
                )}
                <small>{relative(r.created_at)}</small>
                <span className="floor">#{i + 1}</span>
              </div>
              {r.quote_body && (
                <blockquote className="quote-preview">
                  <b>{r.quote_nickname}</b>：{r.quote_body.slice(0, 200)}
                </blockquote>
              )}
              <Markdown text={r.body} />
              <button
                className="quote-button"
                onClick={() => {
                  if (!user) return login();
                  setQuote(r);
                  input.current?.focus();
                }}
              >
                <Quote size={13} />
                回复
              </button>
            </div>
          </article>
        ))}
        <form className="reply-form" onSubmit={submit}>
          {user ? (
            <>
              <div className="reply-writing">
                <Avatar name={user.nickname} />
                <span>
                  以 <b>{user.nickname}</b> 的身份参与讨论
                </span>
              </div>
              {quote && (
                <div className="quote-preview">
                  回复 {quote.nickname}：{quote.body.slice(0, 100)}
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="取消引用"
                    onClick={() => setQuote(null)}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              <textarea
                aria-label="回复内容"
                ref={input}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                maxLength={5000}
                required
                placeholder="聊聊你的想法，友善一点，好奇一点。"
              />
              <ErrorBox message={replyError} />
              <div className="reply-form-bottom">
                <small>支持 Markdown · 尊重每一种声音</small>
                <button
                  className="button small"
                  disabled={busy || !reply.trim()}
                >
                  <Send size={15} />
                  发布回复
                </button>
              </div>
            </>
          ) : (
            <div className="login-prompt">
              <p>好讨论，还差你的声音。</p>
              <button type="button" className="button small" onClick={login}>
                登录后参与 <ArrowRight size={15} />
              </button>
            </div>
          )}
        </form>
      </section>
      {lightbox && <Lightbox id={lightbox} close={() => setLightbox(null)} />}
    </>
  );
}
