"use client";

import { useId, useState } from "react";
import { ArrowUpRight, ChevronDown, Flame, LayoutGrid, Sparkles } from "lucide-react";
import { Link } from "./display";
import type { Post } from "./types";
import { HomeError, HomeLoading } from "./home-states";

type Resource<T> = { data: T | null; loading: boolean; error: string };
type Props = {
  hot: Resource<{ items: Post[] }>;
  featured: Resource<{ items: Post[] }>;
  stats: Resource<{ users: number; posts: number; replies: number }>;
  retry: () => void;
  compact?: boolean;
};

// Both presentations receive the same parent resources; opening the board never fetches again.
export function HomeBoard({ hot, featured, stats, retry, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = <div className="home-board-content" id={id}>
    <section className="home-board-section" aria-label="七天热榜">
      <div className="home-board-heading"><h2><Flame size={18} />大家在聊</h2><span>近 7 天</span></div>
      <HomeError message={hot.error} retry={retry} />
      {hot.loading ? <HomeLoading small /> : hot.data?.items.length ? <ol className="home-hot-list">
        {hot.data.items.slice(0, 5).map((post, index) => <li key={post.id}>
          <Link href={"/p/" + post.id}><span className="home-rank">{String(index + 1).padStart(2, "0")}</span>
            <span className="home-hot-copy"><strong>{post.title}</strong><small>{post.category_name} · {post.heat} 热度</small></span>
          </Link>
        </li>)}
      </ol> : !hot.error && <p className="home-board-empty">还没有热门讨论，来分享第一块瓜。</p>}
    </section>
    <section className="home-board-section" aria-label="编辑精选">
      <div className="home-board-heading"><h2><Sparkles size={18} />编辑精选</h2><Link href="/?view=featured" aria-label="查看全部精选"><ArrowUpRight size={18} /></Link></div>
      <HomeError message={featured.error} retry={retry} />
      {featured.loading ? <HomeLoading small /> : featured.data?.items.length ? <ul className="home-picked-list">
        {featured.data.items.slice(0, 2).map(post => <li key={post.id}><Link href={"/p/" + post.id}>{post.title}<ArrowUpRight size={16} /></Link></li>)}
      </ul> : !featured.error && <p className="home-board-empty">精选还在酝酿，先看看大家的新话题。</p>}
      <Link className="home-board-all" href="/?view=featured">浏览全部精选<ArrowUpRight size={15} /></Link>
    </section>
    <section className="home-board-section" aria-label="社区统计">
      <div className="home-board-heading"><h2>一起，让讨论发生</h2></div>
      <HomeError message={stats.error} retry={retry} />
      {stats.loading ? <HomeLoading small /> : stats.data && <dl className="home-community-stats">
        <div><dt>瓜友</dt><dd>{stats.data.users}</dd></div><div><dt>话题</dt><dd>{stats.data.posts}</dd></div><div><dt>回复</dt><dd>{stats.data.replies}</dd></div>
      </dl>}
    </section>
    <p className="home-board-note">分享新鲜见闻，也尊重不同的声音。</p>
  </div>;
  return compact ? <details className="home-board-fold" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary aria-expanded={open} aria-controls={id}><LayoutGrid size={18} /><span>社区看板<small>热榜 · 精选 · 社区动态</small></span><ChevronDown size={18} /></summary>
    {content}
  </details> : <aside className="home-board" aria-label="社区看板">{content}</aside>;
}
