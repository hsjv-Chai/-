"use client";

import { useData } from "./use-data";
import { type Post } from "./types";
import { Link, ErrorBox, Loading, Empty } from "./display";
import {
  Radio,
  Flame,
  Sparkles,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PostRow } from "./post-row";

export function Feed({
  params,
  view,
  category,
  title,
  version,
}: {
  params: string;
  view: string;
  category: string;
  title: string;
  version: number;
}) {
  const { data, error, loading } = useData<{
    items: Post[];
    total: number;
    page: number;
  }>("posts?" + params, version);
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
      <div className="feed-title">
        <h2>
          {title}
          <span>{data?.total ?? "—"}</span>
        </h2>
        <span className="feed-sub">每一个话题，都是一次相遇</span>
      </div>
      <div className="feed-tabs">
        <nav aria-label="帖子排序">
          {[
            ["latest", "最新发布"],
            ["hot", "热门讨论"],
            ["featured", "精选话题"],
          ].map(([v, label]) => (
            <Link className={view === v ? "active" : ""} key={v} href={tab(v)}>
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
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((post) => <PostRow key={post.id} post={post} />)
      ) : !error ? (
        <Empty title="还没有找到相关话题" />
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
      <div className="feed-end">
        <span /> 生活有瓜，慢慢聊 <span />
      </div>
    </section>
  );
}
