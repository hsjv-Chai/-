"use client";

import Garden from "../garden";
import CardRoom from "../card-room";
import { Suspense, useState, useEffect } from "react";
import { Loading, Empty, Link } from "./display";
import { stripBasePath, appPath } from "@/lib/paths";
import { usePathname, useSearchParams } from "next/navigation";
import { type User, type Category, type Post } from "./types";
import { useData } from "./use-data";
import { api } from "./client";
import { Header, Sidebar, DiscussionSidebar } from "./layout";
import { ArrowUpRight, Plus, Check } from "lucide-react";
import { Feed } from "./feed";
import { PostDetail } from "./post-detail";
import { Editor } from "./editor";
import { Profile } from "./profile";
import { Admin } from "./admin";
import { AuthModal } from "./auth-modal";

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
      <Header
        isGames={isGames}
        isGarden={isGarden}
        isHome={isHome}
        view={view}
        search={search}
        setSearch={setSearch}
        navigate={navigate}
        user={user}
        logout={logout}
        askLogin={askLogin}
        needUser={needUser}
        mobileMenu={mobileMenu}
        setMobileMenu={setMobileMenu}
      />
      <div className={"shell" + (isGames ? " games-shell" : "")}>
        <Sidebar
          isGames={isGames}
          isGarden={isGarden}
          isHome={isHome}
          user={user}
          mobileMenu={mobileMenu}
          category={category}
          params={params}
          stats={stats}
          categories={categories}
          pathname={pathname}
        />
        <main className="main">
          {isGarden ? (
            <Garden
              key={user?.id ?? "guest"}
              user={user}
              ready={authReady}
              login={askLogin}
            />
          ) : isGames ? (
            <CardRoom
              key={pathname}
              roomId={slug[1]}
              user={user}
              ready={authReady}
              login={askLogin}
            />
          ) : isHome ? (
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
              <Garden
                key={user?.id ?? "guest"}
                user={user}
                ready={authReady}
                login={askLogin}
                compact
              />
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
        <DiscussionSidebar isGames={isGames} hot={hot} featured={featured} />
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
