"use client";

import { type User, type Category, type Post } from "./types";
import { Link, Avatar, icons } from "./display";
import {
  Search,
  LogOut,
  ArrowUpRight,
  Plus,
  Menu,
  LayoutGrid,
  Radio,
  Spade,
  Sprout,
  Sparkles,
  Users,
  Settings,
  Flame,
  ArrowRight,
  Heart,
} from "lucide-react";

export function Header({
  isGames,
  isGarden,
  isHome,
  view,
  search,
  setSearch,
  navigate,
  user,
  logout,
  askLogin,
  needUser,
  mobileMenu,
  setMobileMenu,
}: {
  isGames: boolean;
  isGarden: boolean;
  isHome: boolean;
  view: string;
  search: string;
  setSearch: (value: string) => void;
  navigate: (href: string) => void;
  user: User | null;
  logout: () => Promise<void>;
  askLogin: () => void;
  needUser: (fn: () => void) => void;
  mobileMenu: boolean;
  setMobileMenu: (value: boolean) => void;
}) {
  return (
    <header className="header">
      <div className="header-inner">
        <Link className="brand" href="/" aria-label="🍉 首页">
          <span className="brand-fruit">🍉</span>
          <span className="brand-copy">
            <b>
              好瓜，一起聊<span className="brand-dot">.</span>
            </b>
            <small>TAKE A SLICE, JOIN THE TALK.</small>
          </span>
        </Link>
        <nav className="top-nav" aria-label="主导航">
          <Link className={isGames ? "active" : ""} href="/games">
            牌室
          </Link>
          <Link className={isGarden ? "active" : ""} href="/garden/">
            种瓜
          </Link>
          <Link
            className={isHome && view === "latest" ? "active" : ""}
            href="/"
          >
            广场
          </Link>
          <Link
            className={isHome && view === "hot" ? "active" : ""}
            href="/?view=hot"
          >
            热门
          </Link>
          <Link
            className={isHome && view === "featured" ? "active" : ""}
            href="/?view=featured"
          >
            精选
          </Link>
        </nav>
        <form
          className="search"
          onSubmit={(e) => {
            e.preventDefault();
            navigate("/?q=" + encodeURIComponent(search));
          }}
        >
          <Search size={17} />
          <input
            aria-label="搜索帖子"
            placeholder="搜点感兴趣的…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <div className="header-actions">
          {user ? (
            <>
              <Link
                className="user-button"
                href={"/u/" + user.id}
                aria-label="我的主页"
              >
                <Avatar name={user.nickname} />
                <span>{user.nickname}</span>
              </Link>
              <button
                className="icon-button logout"
                title="退出登录"
                onClick={logout}
              >
                <LogOut size={17} />
              </button>
            </>
          ) : (
            <button className="login-button" onClick={askLogin}>
              登录 <ArrowUpRight size={15} />
            </button>
          )}
          <button
            className="button small header-post"
            onClick={() => needUser(() => navigate("/new"))}
          >
            <Plus size={17} />
            发布话题
          </button>
          <button
            className="icon-button mobile-toggle"
            aria-label="展开分区"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            <Menu size={22} />
          </button>
        </div>
      </div>
    </header>
  );
}

export function Sidebar({
  isGames,
  isGarden,
  isHome,
  user,
  mobileMenu,
  category,
  params,
  stats,
  categories,
  pathname,
}: {
  isGames: boolean;
  isGarden: boolean;
  isHome: boolean;
  user: User | null;
  mobileMenu: boolean;
  category: string;
  params: Pick<URLSearchParams, "get" | "toString">;
  stats: { data: { posts: number; users: number; replies: number } | null };
  categories: { data: Category[] | null };
  pathname: string;
}) {
  return (
    <aside className={"left-sidebar " + (mobileMenu ? "mobile-open" : "")}>
      <div className="sidebar-label">一起逛逛</div>
      <Link
        className={
          "side-link " +
          (isHome && !category && !params.get("q") ? "selected" : "")
        }
        href="/"
      >
        <LayoutGrid size={18} />
        <span>全部话题</span>
        <span className="side-count">{stats.data?.posts ?? "—"}</span>
      </Link>
      <div className="sidebar-label sections-label">话题分区</div>
      {categories.data?.map((c) => {
        const Icon = icons[c.id] || Radio;
        return (
          <Link
            key={c.id}
            href={"/?category=" + c.id}
            className={"side-link " + (category === c.id ? "selected" : "")}
          >
            <Icon size={18} />
            <span>{c.name}</span>
            <span className="side-count">{c.count}</span>
          </Link>
        );
      })}
      <div className="sidebar-divider" />
      <Link
        className={"side-link " + (isGames ? "selected" : "")}
        href="/games"
      >
        <Spade size={18} />
        <span>牌室</span>
        <span className="side-count">NEW</span>
      </Link>
      <Link
        className={"side-link " + (isGarden ? "selected" : "")}
        href="/garden/"
      >
        <Sprout size={18} />
        <span>种瓜</span>
        <span className="side-count">每日</span>
      </Link>
      <Link className="side-link" href="/?view=featured">
        <Sparkles size={18} />
        编辑精选
        <ArrowUpRight className="side-end" size={14} />
      </Link>
      {user && (
        <Link
          className={
            "side-link " + (pathname === "/u/" + user.id ? "selected" : "")
          }
          href={"/u/" + user.id}
        >
          <Users size={18} />
          我的小天地
        </Link>
      )}
      {user?.role === "admin" && (
        <Link
          className={"side-link " + (pathname === "/admin" ? "selected" : "")}
          href="/admin"
        >
          <Settings size={18} />
          社区管理
        </Link>
      )}
      <div className="sidebar-note">
        <span className="tiny-fruit">🍉</span>
        <h3>吃瓜，也认真聊。</h3>
        <p>
          保持好奇，友善表达。
          <br />
          每一种声音，都值得被听见。
        </p>
        <span className="note-line" />
      </div>
      <div className="sidebar-footer">
        一个轻松一点的互联网角落。
        <br />
        <span>© {new Date().getFullYear()} 🍉 社区</span>
      </div>
    </aside>
  );
}

export function DiscussionSidebar({
  isGames,
  hot,
  featured,
}: {
  isGames: boolean;
  hot: { data: { items: Post[] } | null };
  featured: { data: { items: Post[] } | null };
}) {
  return (
    <aside className={"right-sidebar" + (isGames ? " games-hide" : "")}>
      <section className="side-panel hot-panel">
        <div className="panel-heading">
          <h2>
            <Flame size={18} /> 此刻，大家在聊
          </h2>
          <span className="live-tag">HOT</span>
        </div>
        <p className="panel-subtitle">过去 7 天的站内讨论热度</p>
        <div className="hot-list">
          {hot.data?.items
            .slice()
            .sort((a, b) => b.heat - a.heat || b.created_at - a.created_at)
            .slice(0, 5)
            .map((p, i) => (
              <Link key={p.id} className="hot-item" href={"/p/" + p.id}>
                <span className={"rank rank-" + i}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{p.title}</h3>
                  <small>
                    {p.category_name}
                    <span>·</span>
                    {p.heat} 热度
                  </small>
                </div>
              </Link>
            ))}
          {hot.data?.items.length === 0 && (
            <p className="muted">第一场热聊，等你开始。</p>
          )}
        </div>
      </section>
      <section className="picked-panel">
        <div className="picked-label">
          <Sparkles size={14} /> EDITOR’S PICK
        </div>
        <h2>
          有些讨论，
          <br />
          值得多停留一会儿。
        </h2>
        {featured.data?.items.slice(0, 2).map((p) => (
          <Link key={p.id} href={"/p/" + p.id} className="picked-item">
            {p.title}
            <ArrowUpRight size={17} />
          </Link>
        ))}
        <Link href="/?view=featured" className="text-link">
          看看全部精选 <ArrowRight size={15} />
        </Link>
      </section>
      <section className="community-note">
        <span className="note-icon">✳</span>
        <h3>热闹可以，冒犯不必。</h3>
        <p>
          讨论观点，尊重彼此。
          <br />
          分享之前多一分求证，
          <br />
          回复之前多一分善意。
        </p>
        <div className="note-bottom">
          让这里，一直是个舒服的地方。
          <Heart size={13} />
        </div>
      </section>
      <div className="local-note">
        <span /> 保持好奇，友善表达
      </div>
    </aside>
  );
}
