"use client";

import { useData } from "./use-data";
import { type User, type Reply, type Post } from "./types";
import { useState } from "react";
import { Loading, ErrorBox, Avatar, Link, Empty, relative } from "./display";
import { PostRow } from "./post-row";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export function Profile({ id, version }: { id: string; version: number }) {
  const { data, error, loading } = useData<{ user: User; replies: Reply[] }>(
    "users/" + id,
    version,
  );
  const posts = useData<{ items: Post[]; total: number }>(
      "posts?author=" + id,
      version,
    ),
    [tab, setTab] = useState("posts");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} />;
  if (!data) return null;
  return (
    <>
      <section className="profile-card">
        <Avatar name={data.user.nickname} large />
        <h1>{data.user.nickname}</h1>
        <p>
          @{data.user.username} ·{" "}
          {new Date(data.user.created_at!).toLocaleDateString("zh-CN")} 加入
        </p>
        <div>
          <b>{posts.data?.total ?? 0}</b> 个话题 <span>·</span>{" "}
          <b>{data.replies.length}</b> 条近期回复
        </div>
      </section>
      <div className="profile-tabs">
        <button
          onClick={() => setTab("posts")}
          className={tab === "posts" ? "active" : ""}
        >
          发布的话题
        </button>
        <button
          onClick={() => setTab("replies")}
          className={tab === "replies" ? "active" : ""}
        >
          参与的讨论
        </button>
      </div>
      <div className="feed">
        {tab === "posts" ? (
          posts.data?.items.length ? (
            <>
              {posts.data.items.map((p) => (
                <PostRow key={p.id} post={p} />
              ))}
              {posts.data.total > 20 && (
                <Link
                  className="text-link profile-more"
                  href={"/?author=" + id}
                >
                  查看全部 {posts.data.total} 个话题 <ArrowRight size={14} />
                </Link>
              )}
            </>
          ) : (
            <Empty title="还没有发布话题" />
          )
        ) : data.replies.length ? (
          data.replies.map((r) => (
            <Link className="profile-reply" key={r.id} href={"/p/" + r.post_id}>
              <small>{relative(r.created_at)} · 回复了</small>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
              <ArrowUpRight size={16} />
            </Link>
          ))
        ) : (
          <Empty title="还没有参与讨论" />
        )}
      </div>
    </>
  );
}
