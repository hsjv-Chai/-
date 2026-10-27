"use client";

import { type Post } from "./types";
import { Link, Avatar, relative, icons } from "./display";
import { Pin, Sparkles, MessageCircle, Heart } from "lucide-react";
import { appPath } from "@/lib/paths";

export function PostRow({ post: p }: { post: Post }) {
  const Icon = icons[p.category_id];
  return (
    <article className="post-row">
      <div className="post-card-heading">
        <div className="post-status">
          {!!p.pinned && (
            <span className="pin-label">
              <Pin size={12} />
              置顶
            </span>
          )}
          {!!p.featured && (
            <span className="featured-mark">
              <Sparkles size={12} />
              精选
            </span>
          )}
          {!!p.demo && <span className="demo-label">虚构演示</span>}
        </div>
        <Link
          className={"category-tag tag-" + p.category_id}
          href={"/?category=" + p.category_id}
        >
          {Icon && <Icon size={12} />}
          {p.category_name}
        </Link>
      </div>
      <Link className="post-title" href={"/p/" + p.id}>
        <h3>{p.title}</h3>
      </Link>
      <div className="post-meta">
        <Link className="author-inline" href={"/u/" + p.user_id}>
          <Avatar name={p.nickname} />
          <span>{p.nickname}</span>
        </Link>
        <span className="meta-dot">·</span>
        <time dateTime={new Date(p.created_at).toISOString()}>
          {relative(p.created_at)}
        </time>
      </div>
      <div className="post-content">
        <p className="post-excerpt">
          {p.body
            .replace("【虚构演示内容】", "")
            .replace(/[#*`>\[\]]/g, "")
            .replace(/\n/g, " ")}
        </p>
        {p.cover && (
          <Link href={"/p/" + p.id} className="post-cover">
            <img
              src={appPath("/api/uploads/" + p.cover)}
              alt={p.title + "的配图"}
              loading="lazy"
            />
          </Link>
        )}
      </div>
      <div className="post-bottom">
        <Link className="response-link" href={"/p/" + p.id}>
          <MessageCircle size={16} />
          <span>{p.reply_count ? p.reply_count + " 条讨论" : "参与讨论"}</span>
        </Link>
        <div className="post-metrics">
          <span>
            <Heart size={15} />
            {p.like_count}
            <span className="metric-label"> 人喜欢</span>
          </span>
          <Link className="post-open" href={"/p/" + p.id}>
            看看讨论 <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
