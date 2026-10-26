"use client";

import { type Post } from "./types";
import { Link, Avatar, relative } from "./display";
import { Pin, Sparkles, MessageCircle, Heart } from "lucide-react";
import { appPath } from "@/lib/paths";

export function PostRow({ post: p }: { post: Post }) {
  return (
    <article className="post-row">
      <div className="post-main">
        <div className="post-meta">
          <Link className="author-inline" href={"/u/" + p.user_id}>
            <Avatar name={p.nickname} />
            {p.nickname}
          </Link>
          <span className="meta-dot">·</span>
          <time>{relative(p.created_at)}</time>
          {!!p.demo && <span className="demo-label">演示</span>}
          {!!p.pinned && (
            <span className="pin-label">
              <Pin size={11} />
              置顶
            </span>
          )}
        </div>
        <Link className="post-title" href={"/p/" + p.id}>
          <h3>
            {p.title}
            {!!p.featured && (
              <span className="featured-mark" title="编辑精选">
                <Sparkles size={13} />
              </span>
            )}
          </h3>
        </Link>
        <p className="post-excerpt">
          {p.body
            .replace("【虚构演示内容】", "")
            .replace(/[#*`>\[\]]/g, "")
            .replace(/\n/g, " ")}
        </p>
        <div className="post-bottom">
          <Link
            className={"category-tag tag-" + p.category_id}
            href={"/?category=" + p.category_id}
          >
            {p.category_name}
          </Link>
          <div className="post-metrics">
            <span>
              <MessageCircle size={14} />
              {p.reply_count}
              <span className="metric-label"> 条讨论</span>
            </span>
            <span>
              <Heart size={14} />
              {p.like_count}
            </span>
          </div>
        </div>
      </div>
      {p.cover && (
        <Link href={"/p/" + p.id} className="post-cover">
          <img
            src={appPath("/api/uploads/" + p.cover)}
            alt={p.title + "的配图"}
            loading="lazy"
          />
        </Link>
      )}
    </article>
  );
}
