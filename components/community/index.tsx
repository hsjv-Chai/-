"use client";

import Garden from "../garden";
import CardRoom from "../card-room";
import { Suspense, useState, useEffect, useCallback } from "react";
import { Loading, Empty, Link } from "./display";
import { stripBasePath, appPath } from "@/lib/paths";
import { usePathname, useSearchParams } from "next/navigation";
import { type User, type Category, type Post } from "./types";
import { useData } from "./use-data";
import { api } from "./client";
import { Header, Sidebar, DiscussionSidebar, MobileNavigation } from "./layout";
import { Check } from "lucide-react";
import { Welcome } from "./welcome";
import { Feed } from "./feed";
import { PostDetail } from "./post-detail";
import { Editor } from "./editor";
import { Profile } from "./profile";
import { Admin } from "./admin";
import { AuthModal } from "./auth-modal";
import { MuseumView } from "../museum/view";
import { MuseumAdminList, MuseumEditor } from "../museum/admin";

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
    let active=true;
    const load=()=>api<{ user: User | null }>("auth/me")
      .then((d) => {if(active)setUser(d.user);})
      .catch(() => {if(active)setUser(null);})
      .finally(() => {if(active)setAuthReady(true);});
    void load();
    // The game owns its final-result handoff so a background auth refresh cannot erase it.
    if(pathname==='/games'||pathname.startsWith('/games/'))return()=>{active=false;};
    const timer=setInterval(load,30000);
    window.addEventListener('focus',load);
    return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',load);};
  }, [version,pathname]);
  const endGameSession=useCallback(()=>setUser(null),[]);
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
    isMuseum = pathname === "/museum" || pathname.startsWith("/museum/") || pathname === "/admin/museum" || pathname.startsWith("/admin/museum/"),
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
      <div className={isMuseum ? "museum-mode" : undefined}>
      <Header
        isGames={isGames}
        isGarden={isGarden}
        isHome={isHome}
        isMuseum={isMuseum}
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
      <div className={"shell" + (isGames ? " games-shell" : "") + (isMuseum ? " museum-shell" : "")}>
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
          {user?.account_status === "restricted" && <div className="account-notice" role="status">
            <strong>账号已受限</strong><p>{user.ban_reason}。论坛、种瓜及新牌局操作已暂停。当前整场牌局结束后退出登录。</p>
            {user.restricted_room_id && <Link href={"/games/"+user.restricted_room_id}>返回当前牌局</Link>}
          </div>}
          {isMuseum ? (
            slug[0] === "admin" ? slug.length === 2 ? <MuseumAdminList user={user} ready={authReady} /> : slug.length === 3 ? <MuseumEditor key={slug[2]} id={slug[2]} user={user} ready={authReady} /> : <Empty title="此管理页面不存在" />
              : <MuseumView key={pathname + params.toString()} path={slug.slice(1)} params={params.toString()} user={user} ready={authReady} />
          ) : isGarden ? (
            <Garden
              key={user?.id ?? "guest"}
              user={user}
              ready={authReady}
              login={askLogin}
            />
          ) : isGames ? (
            <CardRoom
              key={pathname}
              onSessionEnded={endGameSession}
              roomId={slug[1]}
              user={user}
              ready={authReady}
              login={askLogin}
            />
          ) : isHome ? (
            <>
              <Welcome
                categories={categories.data || []}
                activeCategory={category}
                user={user}
                ready={authReady}
                login={askLogin}
                compose={() => needUser(() => navigate("/new"))}
              />
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
        <DiscussionSidebar
          isGames={isGames || isMuseum}
          hot={hot}
          featured={featured}
          stats={stats}
        />
      </div>
      <MobileNavigation
        isHome={isHome}
        isGames={isGames}
        isGarden={isGarden}
        isMuseum={isMuseum}
        compose={() => needUser(() => navigate("/new"))}
      />
      </div>
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
