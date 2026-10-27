"use client";

import type { User, Category, Post } from "./types";
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
  X,
} from "lucide-react";

type NavigationProps = { isGames: boolean; isGarden: boolean; isHome: boolean };

export function Header({
  isGames,
  isGarden,
  isHome,
  search,
  setSearch,
  navigate,
  user,
  logout,
  askLogin,
  needUser,
  mobileMenu,
  setMobileMenu,
}: NavigationProps & {
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
            <small>MELON COMMUNITY</small>
          </span>
        </Link>
        <form
          className="search"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            navigate("/?q=" + encodeURIComponent(search));
          }}
        >
          <Search size={18} />
          <input
            aria-label="搜索帖子"
            placeholder="搜索感兴趣的话题…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <kbd>↵</kbd>
        </form>
        <nav className="top-nav" aria-label="主导航">
          <Link
            className={isHome ? "active" : ""}
            href="/"
            aria-current={isHome ? "page" : undefined}
          >
            话题广场
          </Link>
          <Link
            className={isGames ? "active" : ""}
            href="/games"
            aria-current={isGames ? "page" : undefined}
          >
            牌室
          </Link>
          <Link
            className={isGarden ? "active" : ""}
            href="/garden/"
            aria-current={isGarden ? "page" : undefined}
          >
            种瓜
          </Link>
        </nav>
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
                aria-label="退出登录"
                onClick={logout}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <button className="login-button" onClick={askLogin}>
              登录 / 注册 <ArrowUpRight size={15} />
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
            aria-label={mobileMenu ? "收起分区" : "展开分区"}
            aria-expanded={mobileMenu}
            aria-controls="community-sidebar"
            onClick={() => setMobileMenu(!mobileMenu)}
          >
            {mobileMenu ? <X size={22} /> : <Menu size={22} />}
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
}: NavigationProps & {
  user: User | null;
  mobileMenu: boolean;
  category: string;
  params: Pick<URLSearchParams, "get" | "toString">;
  stats: { data: { posts: number; users: number; replies: number } | null };
  categories: { data: Category[] | null };
  pathname: string;
}) {
  return (
    <aside
      id="community-sidebar"
      className={"left-sidebar " + (mobileMenu ? "mobile-open" : "")}
      aria-label="社区导航"
    >
      <div className="sidebar-label">我的社区</div>
      <Link
        className={
          "side-link " +
          (isHome && !category && !params.get("q") ? "selected" : "")
        }
        href="/"
      >
        <span className="nav-symbol">
          <LayoutGrid size={18} />
        </span>
        <span>全部话题</span>
        <span className="side-count">{stats.data?.posts ?? "—"}</span>
      </Link>
      <Link
        className={"side-link " + (isGames ? "selected" : "")}
        href="/games"
      >
        <span className="nav-symbol nav-cards">
          <Spade size={18} />
        </span>
        <span>
          牌室<small>斗地主 · 掼蛋</small>
        </span>
      </Link>
      <Link
        className={"side-link " + (isGarden ? "selected" : "")}
        href="/garden/"
      >
        <span className="nav-symbol nav-garden">
          <Sprout size={18} />
        </span>
        <span>
          种瓜<small>照料每天的小期待</small>
        </span>
      </Link>
      <div className="sidebar-label sections-label">
        话题分区 <span>{categories.data?.length ?? 4}</span>
      </div>
      {categories.data?.map((item) => {
        const Icon = icons[item.id] || Radio;
        return (
          <Link
            key={item.id}
            href={"/?category=" + item.id}
            className={
              "side-link category-link section-" +
              item.id +
              (category === item.id ? " selected" : "")
            }
            aria-current={category === item.id ? "page" : undefined}
          >
            <span className="section-icon">
              <Icon size={17} />
            </span>
            <span>
              {item.name}
              <small>{item.description}</small>
            </span>
            <span className="side-count">{item.count}</span>
          </Link>
        );
      })}
      <div className="sidebar-divider" />
      <Link className="side-link" href="/?view=featured">
        <span className="nav-symbol">
          <Sparkles size={18} />
        </span>
        <span>编辑精选</span>
        <ArrowUpRight className="side-end" size={14} />
      </Link>
      {user && (
        <Link
          className={
            "side-link " + (pathname === "/u/" + user.id ? "selected" : "")
          }
          href={"/u/" + user.id}
        >
          <span className="nav-symbol">
            <Users size={18} />
          </span>
          我的小天地
        </Link>
      )}
      {user?.role === "admin" && (
        <Link
          className={"side-link " + (pathname === "/admin" ? "selected" : "")}
          href="/admin"
        >
          <span className="nav-symbol">
            <Settings size={18} />
          </span>
          社区管理
        </Link>
      )}
      <div className="sidebar-note">
        <span className="tiny-fruit">🍉</span>
        <h3>生活有瓜，慢慢聊。</h3>
        <p>
          保持好奇，友善表达。
          <br />
          每一种声音，都值得被听见。
        </p>
        <Link href="/?view=featured">
          去发现好讨论 <ArrowUpRight size={14} />
        </Link>
      </div>
      <div className="sidebar-footer">
        © {new Date().getFullYear()} 🍉 社区
        <br />
        <span>吃瓜，也认真聊。</span>
      </div>
    </aside>
  );
}

export function DiscussionSidebar({
  isGames,
  hot,
  featured,
  stats,
}: {
  isGames: boolean;
  hot: { data: { items: Post[] } | null };
  featured: { data: { items: Post[] } | null };
  stats: { data: { posts: number; users: number; replies: number } | null };
}) {
  return (
    <aside
      className={"right-sidebar" + (isGames ? " games-hide" : "")}
      aria-label="社区动态"
    >
      <section className="community-card">
        <div className="community-card-art" aria-hidden="true">
          <span>🍉</span>
          <i>✦</i>
          <b>✳</b>
        </div>
        <span className="community-card-label">这里有瓜，也有好好说话的人</span>
        <h2>小小社区，大大好奇。</h2>
        <p>
          分享你的发现，
          <br />
          让有趣的人和想法在这里碰头。
        </p>
        <div className="community-counts">
          <div>
            <strong>{stats.data?.users ?? "—"}</strong>
            <span>位瓜友</span>
          </div>
          <div>
            <strong>{stats.data?.replies ?? "—"}</strong>
            <span>次交流</span>
          </div>
        </div>
      </section>
      <section className="side-panel hot-panel">
        <div className="panel-heading">
          <h2>
            <Flame size={17} />
            此刻，大家在聊
          </h2>
          <span className="live-tag">7 天</span>
        </div>
        <p className="panel-subtitle">来自站内互动的真实热度</p>
        <div className="hot-list">
          {hot.data?.items
            .slice()
            .sort((a, b) => b.heat - a.heat || b.created_at - a.created_at)
            .slice(0, 5)
            .map((post, index) => (
              <Link key={post.id} className="hot-item" href={"/p/" + post.id}>
                <span className={"rank rank-" + index}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{post.title}</h3>
                  <small>
                    {post.category_name}
                    <span>·</span>
                    {post.heat} 热度
                  </small>
                </div>
              </Link>
            ))}
          {hot.data?.items.length === 0 && (
            <p className="muted hot-empty">第一场热聊，等你开始。</p>
          )}
        </div>
      </section>
      <section className="picked-panel">
        <div className="picked-label">
          <Sparkles size={14} />
          编辑精选
        </div>
        <h2>值得多停留一会儿。</h2>
        {featured.data?.items.slice(0, 2).map((post) => (
          <Link key={post.id} href={"/p/" + post.id} className="picked-item">
            {post.title}
            <ArrowUpRight size={16} />
          </Link>
        ))}
        <Link href="/?view=featured" className="text-link">
          看看全部精选 <ArrowRight size={14} />
        </Link>
      </section>
      <div className="community-note">
        <Heart size={15} />
        <p>
          讨论观点，尊重彼此。
          <br />
          让这里一直是个舒服的地方。
        </p>
      </div>
    </aside>
  );
}

export function MobileNavigation({
  isHome,
  isGames,
  isGarden,
  compose,
}: NavigationProps & { compose: () => void }) {
  return (
    <nav className="mobile-navigation" aria-label="快捷导航">
      <Link className={isHome ? "active" : ""} href="/">
        <LayoutGrid size={19} />
        <span>广场</span>
      </Link>
      <Link className={isGames ? "active" : ""} href="/games">
        <Spade size={19} />
        <span>牌室</span>
      </Link>
      <Link className={isGarden ? "active" : ""} href="/garden/">
        <Sprout size={19} />
        <span>种瓜</span>
      </Link>
      <button onClick={compose}>
        <Plus size={20} />
        <span>发话题</span>
      </button>
    </nav>
  );
}
