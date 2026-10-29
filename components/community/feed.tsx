"use client";

import { useState, type ReactNode } from "react";
import { useData } from "./use-data";
import { type Post } from "./types";
import { Link, Empty } from "./display";
import {
  Radio,
  Flame,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PostRow } from "./post-row";
import { HomeLoading, HomeError } from "./home-states";

export function Feed({
  params,
  view,
  category,
  title,
  version,
  board,
}: {
  params: string;
  view: string;
  category: string;
  title: string;
  version: number;
  board?: ReactNode;
}) {
  const [attempt, setAttempt] = useState(0);
  const { data, error, loading } = useData<{
    items: Post[];
    total: number;
    page: number;
  }>("posts?" + params, version + attempt);
  function tab(v: string) {
    const n = new URLSearchParams(params);
    n.set("view", v);
    n.delete("page");
    return "/?" + n;
  }
  function page(n: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(n));
    return "/?" + next;
  }
  return (
    <section className="feed">
      {board}
      <div className="feed-title">
        <h2>
          {title}
          <span>{data?.total ?? "—"}</span>
        </h2>
      </div>
      <div className="feed-tabs">
        <nav aria-label="帖子排序">
          {[
            ["latest", "最新发布"],
            ["hot", "热门讨论"],
            ["featured", "精选话题"],
          ].map(([v, label]) => (
            <Link className={view === v ? "active" : ""} aria-current={view === v ? "page" : undefined} key={v} href={tab(v)}>
              {v === "latest" ? (
                <Radio size={15} />
              ) : v === "hot" ? (
                <Flame size={15} />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              {label}
            </Link>
          ))}
        </nav>
        <span className="feed-sort">{category ? "分区话题" : "全部分区"}</span>
      </div>
      <HomeError message={error} retry={() => setAttempt((n) => n + 1)} />
      {loading ? (
        <HomeLoading />
      ) : data?.items.length ? (
        data.items.map((post) => <PostRow key={post.id} post={post} />)
      ) : !error ? (
        <Empty title={new URLSearchParams(params).get("q") ? "没有找到相关话题" : category ? "这个分区还没有话题" : "第一场讨论，等你开始"}>
          {new URLSearchParams(params).get("q") ? "试试其他关键词，或返回全部话题。" : "分享一点新鲜见闻，开启这里的第一场讨论。"}
          {(category || new URLSearchParams(params).get("q")) && <Link className="home-reset" href="/">返回全部话题</Link>}
        </Empty>
      ) : null}
      {data && data.total > 20 && (
        <nav className="pagination" aria-label="分页">
          {data.page > 1 ? (
            <Link href={page(data.page - 1)}>
              <ChevronLeft size={15} />
              上一页
            </Link>
          ) : (
            <span />
          )}
          <span>
            {data.page} / {Math.ceil(data.total / 20)}
          </span>
          {data.page < Math.ceil(data.total / 20) && (
            <Link href={page(data.page + 1)}>
              下一页
              <ChevronRight size={15} />
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}
