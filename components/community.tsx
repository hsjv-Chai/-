"use client";
import {
  useEffect,
  useState,
  useRef,
  Suspense,
  type FormEvent,
  type ReactNode,
  type AnchorHTMLAttributes,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
// Standard document navigation avoids Vinext beta's production RSC prefetch issue.
function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={props.href?appPath(props.href):undefined} />;
}
import {
  Spade,
  Sprout,
  Search,
  Plus,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
  ChevronLeft,
  MessageCircle,
  Heart,
  Flame,
  Sparkles,
  LayoutGrid,
  Radio,
  Monitor,
  Popcorn,
  Coffee,
  LogOut,
  Settings,
  ImagePlus,
  X,
  Pin,
  Check,
  ArrowLeft,
  Eye,
  Send,
  Menu,
  Quote,
  LoaderCircle,
  AlertCircle,
  PenLine,
  Users,
} from "lucide-react";
import Markdown from "./markdown";
import CardRoom from "./card-room";
import Garden from "./garden";
import {appPath, stripBasePath} from "@/lib/paths";
type User = {
  id: string;
  username: string;
  nickname: string;
  role: string;
  created_at?: number;
};
type Category = {
  id: string;
  name: string;
  description: string;
  count: number;
};
type Post = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category_id: string;
  category_name: string;
  nickname: string;
  username: string;
  created_at: number;
  updated_at: number;
  like_count: number;
  reply_count: number;
  liked: number;
  featured: number;
  pinned: number;
  hidden: number;
  demo: number;
  cover: string | null;
  heat: number;
};
type Reply = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  nickname: string;
  created_at: number;
  quote_body: string | null;
  quote_nickname: string | null;
  hidden: number;
  title?: string;
};
type Detail = { post: Post; replies: Reply[]; images: { id: string }[] };
const icons: Record<string, typeof Flame> = {
  hot: Radio,
  fun: Popcorn,
  tech: Monitor,
  life: Coffee,
};
async function api<T = any>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(appPath("/api/" + path), {
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data: any = await response.json();
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后再试");
  return data;
}
function useData<T>(path: string | null, version = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setError("");
    setLoading(true);
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    api<T>(path)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [path, version]);
  return { data, error, loading };
}
function relative(time: number) {
  const d = Math.max(0, Date.now() - time);
  return d < 60000
    ? "刚刚"
    : d < 3600000
      ? Math.floor(d / 60000) + " 分钟前"
      : d < 86400000
        ? Math.floor(d / 3600000) + " 小时前"
        : d < 604800000
          ? Math.floor(d / 86400000) + " 天前"
          : new Date(time).toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
            });
}
function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const colors = ["sage", "rose", "sand", "blue", "lilac"];
  return (
    <span
      className={
        "avatar " +
        colors[(name.codePointAt(0) || 0) % 5] +
        (large ? " large" : "")
      }
    >
      {name.slice(0, 1)}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <span>🍃</span>
      <h3>{title}</h3>
      <p>{children || "换个关键词，或者来聊点新鲜的吧。"}</p>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" /> 正在搬来新鲜的瓜…
    </div>
  );
}
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error">
      <AlertCircle size={16} />
      {message}
    </div>
  ) : null;
}
export default function Community() {
  return (
    <Suspense fallback={<Loading />}>
      <App />
    </Suspense>
  );
}
function App() {
  const pathname = stripBasePath(usePathname()),
    params = useSearchParams(),
    [version, setVersion] = useState(0),
    [user, setUser] = useState<User | null>(null),
    [authReady, setAuthReady] = useState(false),
    [auth, setAuth] = useState<"login" | "register" | null>(null),
    [toast, setToast] = useState(""),
    [mobileMenu, setMobileMenu] = useState(false),
    [search, setSearch] = useState(params.get("q") || "");
  const categories = useData<Category[]>("categories", version),
    stats = useData<{ posts: number; users: number; replies: number }>(
      "stats",
      version,
    );
  const hot = useData<{ items: Post[] }>("posts?view=ranking", version),
    featured = useData<{ items: Post[] }>("posts?view=featured", version);
  const refresh = () => setVersion((v) => v + 1);
  useEffect(() => {
    api<{ user: User | null }>("auth/me")
      .then((d) => setUser(d.user))
      .catch(() => setUser(null))
      .finally(() => setAuthReady(true));
  }, [version]);
  useEffect(() => {
    setMobileMenu(false);
    setSearch(params.get("q") || "");
  }, [pathname, params]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const askLogin = () => setAuth("login");
  const needUser = (fn: () => void) => (user ? fn() : askLogin());
  const navigate = (href: string) => window.location.assign(appPath(href));
  const category = params.get("category") || "",
    view = params.get("view") || "latest",
    isHome = pathname === "/",
    isGarden = pathname === "/garden" || pathname === "/garden/",
    isGames = pathname === "/games" || pathname.startsWith("/games/"),
    selectedCategory = categories.data?.find((c) => c.id === category);
  const slug = pathname.split("/").filter(Boolean);
  async function logout() {
    try {
      await api("auth/logout", { method: "POST" });
      setUser(null);
      refresh();
      navigate("/");
      setToast("已退出登录，下次见。");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  return (
    <>
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
            <Link className={isGames ? "active" : ""} href="/games">牌室</Link>
            <Link className={isGarden ? "active" : ""} href="/garden/">种瓜</Link>
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
      <div className={"shell" + (isGames ? " games-shell" : "")}>
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
          <Link className={"side-link " + (isGames ? "selected" : "")} href="/games"><Spade size={18}/><span>牌室</span><span className="side-count">NEW</span></Link>
          <Link className={"side-link " + (isGarden ? "selected" : "")} href="/garden/"><Sprout size={18}/><span>种瓜</span><span className="side-count">每日</span></Link>
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
              className={
                "side-link " + (pathname === "/admin" ? "selected" : "")
              }
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
        <main className="main">
          {isGarden ? <Garden key={user?.id ?? "guest"} user={user} ready={authReady} login={askLogin}/> : isGames ? (<CardRoom key={pathname} roomId={slug[1]} user={user} ready={authReady} login={askLogin}/>) : isHome ? (
            <>
              <section className="hero">
                <div className="hero-copy">
                  <div className="eyebrow">
                    <span /> THE DAILY SLICE{" "}
                    <span className="issue">VOL. 001</span>
                  </div>
                  <h1>
                    新鲜事，
                    <br />
                    切一块聊聊<span>。</span>
                  </h1>
                  <p>
                    从热闹的话题，到生活的小事。
                    <br />
                    在这里，找到和你一样好奇的人。
                  </p>
                  <button
                    onClick={() => needUser(() => navigate("/new"))}
                    className="hero-link"
                  >
                    今天，你想聊什么？ <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <span className="art-star star-one">✳</span>
                  <div className="fruit-shadow" />
                  <div className="melon">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="small-melon">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="art-caption">
                    fresh thoughts,
                    <br />
                    good company.
                  </span>
                  <span className="art-star star-two">✧</span>
                  <span className="art-label">100% 新鲜讨论</span>
                </div>
              </section>
              <Garden key={user?.id ?? "guest"} user={user} ready={authReady} login={askLogin} compact/>
              <div className="welcome-strip">
                <span>
                  <span className="live-dot" /> 让好奇心在这里碰头
                </span>
                <span>
                  {stats.data?.users ?? "—"} 位瓜友 ·{" "}
                  {stats.data?.replies ?? "—"} 次交流 <ArrowUpRight size={13} />
                </span>
              </div>
              <Feed
                key={params.toString()}
                params={params.toString()}
                view={view}
                category={category}
                title={
                  params.get("q")
                    ? "搜索「" + params.get("q") + "」"
                    : selectedCategory?.name || "话题广场"
                }
                version={version}
              />
            </>
          ) : slug[0] === "p" && slug[1] ? (
            <PostDetail
              key={slug[1]}
              id={slug[1]}
              user={user}
              version={version}
              refresh={refresh}
              login={askLogin}
              notify={setToast}
            />
          ) : pathname === "/new" || slug[0] === "edit" ? (
            <Editor
              key={pathname}
              id={slug[0] === "edit" ? slug[1] : undefined}
              user={user}
              ready={authReady}
              categories={categories.data || []}
              login={askLogin}
              done={(pid) => {
                refresh();
                navigate("/p/" + pid);
                setToast("话题已保存，让讨论发生吧。");
              }}
            />
          ) : slug[0] === "u" && slug[1] ? (
            <Profile key={slug[1]} id={slug[1]} version={version} />
          ) : pathname === "/admin" ? (
            <Admin
              user={user}
              ready={authReady}
              version={version}
              refresh={refresh}
              notify={setToast}
            />
          ) : (
            <Empty title="这里还没有瓜">
              <Link href="/">回到广场</Link>
            </Empty>
          )}
        </main>
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
      </div>
      <button
        className={"button mobile-compose" + (isGames ? " games-hide" : "")}
        onClick={() => needUser(() => navigate("/new"))}
      >
        <Plus size={18} />
        发布话题
      </button>
      {auth && (
        <AuthModal
          mode={auth}
          setMode={setAuth}
          close={() => setAuth(null)}
          done={() => {
            setAuth(null);
            refresh();
            setToast("欢迎来到 🍉，一起聊点新鲜的。");
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </>
  );
}
function Feed({
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
function PostRow({ post: p }: { post: Post }) {
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
function AuthModal({
  mode,
  setMode,
  close,
  done,
}: {
  mode: "login" | "register";
  setMode: (m: "login" | "register") => void;
  close: () => void;
  done: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("auth/" + mode, { method: "POST", body: JSON.stringify(data) });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="auth-dialog"
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <button
        className="icon-button close-dialog"
        aria-label="关闭"
        onClick={close}
      >
        <X size={20} />
      </button>
      <div className="auth-fruit">🍉</div>
      <h2>{mode === "login" ? "好久不见，瓜友。" : "留个名字，一起吃瓜。"}</h2>
      <p>一点好奇心，一群聊得来的人。</p>
      <form onSubmit={submit}>
        <label>
          用户名
          <input
            name="username"
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_]+"
            autoComplete="username"
            placeholder="3–24 位字母、数字或下划线"
          />
        </label>
        {mode === "register" && (
          <label>
            昵称
            <input
              name="nickname"
              required
              minLength={2}
              maxLength={20}
              autoComplete="nickname"
              placeholder="大家怎么称呼你？"
            />
          </label>
        )}
        <label>
          密码
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            placeholder="至少 8 个字符"
          />
        </label>
        <ErrorBox message={error} />
        <button className="button full" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {mode === "login" ? "登录，加入讨论" : "注册，成为瓜友"}
          <ArrowRight size={16} />
        </button>
      </form>
      <div className="auth-switch">
        {mode === "login" ? "还没有账号？" : "已经有账号？"}
        <button
          onClick={() => {
            setError("");
            setMode(mode === "login" ? "register" : "login");
          }}
        >
          {mode === "login" ? "来这里注册" : "直接登录"}
        </button>
      </div>
    </dialog>
  );
}
function PostDetail({
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
function Lightbox({ id, close }: { id: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog className="lightbox" ref={ref} onCancel={close} onClick={close}>
      <button aria-label="关闭图片" className="icon-button">
        <X />
      </button>
      <img src={appPath("/api/uploads/" + id)} alt="放大的帖子配图" />
    </dialog>
  );
}
function Editor({
  id,
  user,
  ready,
  categories,
  login,
  done,
}: {
  id?: string;
  user: User | null;
  ready: boolean;
  categories: Category[];
  login: () => void;
  done: (id: string) => void;
}) {
  const detail = useData<Detail>(id ? "posts/" + id : null),
    [title, setTitle] = useState(""),
    [body, setBody] = useState(""),
    [category, setCategory] = useState("hot"),
    [images, setImages] = useState<string[]>([]),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (detail.data) {
      setTitle(detail.data.post.title);
      setBody(detail.data.post.body);
      setCategory(detail.data.post.category_id);
      setImages(detail.data.images.map((i) => i.id));
    }
  }, [detail.data]);
  async function upload(files: FileList | null) {
    if (!files) return;
    setError("");
    if (files.length + images.length > 9) {
      setError("每篇帖子最多上传 9 张图片");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("每张图片不能超过 5 MB");
        const form = new FormData();
        form.append("file", file);
        const image = await api<{ id: string }>("uploads", {
          method: "POST",
          body: form,
        });
        setImages((prev) => [...prev, image.id]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{ id: string }>("posts" + (id ? "/" + id : ""), {
        method: id ? "PATCH" : "POST",
        body: JSON.stringify({ title, body, category_id: category, images }),
      });
      done(result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!ready || (id && detail.loading)) return <Loading />;
  if (!user)
    return (
      <section className="editor-card">
        <Empty title="分享之前，先认识一下">
          <button className="button" onClick={login}>
            登录 / 注册
          </button>
        </Empty>
      </section>
    );
  if (detail.error) return <ErrorBox message={detail.error} />;
  if (id && detail.data?.post.user_id !== user.id)
    return <ErrorBox message="只能编辑自己的帖子" />;
  return (
    <>
      <Link className="back-link" href={id ? "/p/" + id : "/"}>
        <ArrowLeft size={16} />
        返回
      </Link>
      <section className="editor-card">
        <div className="eyebrow">A NEW CONVERSATION</div>
        <h1>{id ? "让想法更完整。" : "今天，分享什么新鲜事？"}</h1>
        <p className="muted">一个好话题，就是一场好讨论的开始。</p>
        <form onSubmit={save}>
          <label>
            选择分区
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            话题标题
            <input
              className="title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={100}
              placeholder="用一句话，让大家想点进来"
            />
          </label>
          <div className="editor-toolbar">
            <span>
              正文 <small>支持 Markdown</small>
            </span>
            <button
              className={preview ? "active" : ""}
              type="button"
              onClick={() => setPreview(!preview)}
            >
              <Eye size={15} />
              {preview ? "继续编辑" : "预览排版"}
            </button>
          </div>
          {preview ? (
            <div className="editor-preview">
              <Markdown text={body || "你的想法，会在这里变成文字。"} />
            </div>
          ) : (
            <textarea
              aria-label="帖子正文"
              className="body-input"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              minLength={5}
              maxLength={20000}
              placeholder={
                "说说发生了什么，或者分享你的观察…\n\n支持 **加粗**、列表、引用、代码和链接。"
              }
            />
          )}
          <div className="upload-area">
            <label className={"upload-button " + (uploading ? "disabled" : "")}>
              <ImagePlus size={20} />
              {uploading ? "上传中…" : "添加图片"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                disabled={uploading || busy || images.length >= 9}
                onChange={(e) => {
                  upload(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
            <span>{images.length}/9 · 每张不超过 5 MB</span>
          </div>
          {images.length > 0 && (
            <div className="upload-thumbs">
              {images.map((image, i) => (
                <div key={image}>
                  <img
                    src={appPath("/api/uploads/" + image)}
                    alt={"已上传图片 " + (i + 1)}
                  />
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={"移除图片 " + (i + 1)}
                    onClick={() => setImages(images.filter((x) => x !== image))}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <ErrorBox message={error} />
          <div className="editor-bottom">
            <small>分享有依据的信息，保持善意与好奇。</small>
            <button
              className="button"
              disabled={
                busy ||
                uploading ||
                body.trim().length < 5 ||
                title.trim().length < 3
              }
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <ArrowUpRight size={17} />
              )}{" "}
              {id ? "保存修改" : "发布话题"}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
function Profile({ id, version }: { id: string; version: number }) {
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
function Admin({
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
