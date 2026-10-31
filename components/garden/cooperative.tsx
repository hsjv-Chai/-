"use client";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  Copy,
  Droplets,
  LoaderCircle,
  LogOut,
  Pencil,
  Plus,
  Sprout,
  Users,
} from "lucide-react";
import { appPath } from "@/lib/paths";
import { GROWTH_STAGES } from "@/lib/garden/model";
import type {
  CoopCard,
  CoopDetail,
  CoopList,
} from "@/lib/garden/cooperative-model";
import { MelonPlant } from "./plant";
import { coopRequest, useCooperative } from "./use-cooperative";
import {
  Progress,
  Card,
  Skeleton,
  Failure,
  Pagination,
  GardenForm,
  Memories,
  coopLink,
} from "./cooperative-ui";

type User = { id: string; nickname: string; account_status?: string };
type Props = {
  coopId?: string;
  params: string;
  user: User | null;
  ready: boolean;
  login: () => void;
};
const date = (time: number) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(time);
export function CooperativeGarden({
  coopId,
  params,
  user,
  ready,
  login,
}: Props) {
  const query = new URLSearchParams(params),
    q = query.get("q") || "",
    page = query.get("page") || "1";
  const endpoint = coopId
    ? "/" + encodeURIComponent(coopId) + "?page=" + encodeURIComponent(page)
    : "?" + new URLSearchParams({ q, page });
  const [memoryPage, setMemoryPage] = useState(1),
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState(false),
    [leaving, setLeaving] = useState(false),
    [creating, setCreating] = useState(false);
  const exitButton = useRef<HTMLButtonElement>(null);
  const [notice, setNotice] = useState(""),
    [writeError, setWriteError] = useState(""),
    [shareError, setShareError] = useState("");
  const activeUser =
    user && (user.account_status ?? "active") === "active"
      ? user.id
      : undefined;
  const {
    data,
    me,
    loading,
    error,
    meError,
    load,
    beginMutation,
    endMutation,
  } = useCooperative<CoopList | CoopDetail>(endpoint, activeUser, memoryPage);
  const detail = data && "garden" in data ? data : null,
    list = data && "items" in data ? data : null;
  const garden = detail?.garden,
    isMember = !!detail?.members.some((m) => m.userId === user?.id),
    isOwner = !!user && garden?.ownerId === user.id;
  const canAct = ready && !busy && !loading && !!activeUser && !!me;
  async function perform(
    path: string,
    method: string,
    body: object,
    message: string,
  ) {
    if (!beginMutation()) return false;
    setBusy(true);
    setWriteError("");
    setNotice("");
    try {
      const result = await coopRequest<{ garden?: CoopCard }>(
        path,
        method,
        body,
      );
      setNotice(
        path.endsWith("/water") && result.garden?.mature
          ? "西瓜成熟啦！本轮贡献者的合种纪念已记下。"
          : message,
      );
      return true;
    } catch (e) {
      setWriteError((e as Error).message);
      return false;
    } finally {
      await endMutation();
      setBusy(false);
    }
  }
  async function create(input: {
    name: string;
    intro: string;
    requestId?: string;
  }) {
    const saved = await perform(
      "",
      "POST",
      input,
      "瓜田已创建，欢迎第一位照料它的人。",
    );
    if (saved) window.location.assign(coopLink(input.requestId!));
    return saved;
  }
  async function leave() {
    if (!garden) return;
    await perform(
      "/" + garden.id + "/leave",
      "POST",
      {},
      "已退出瓜田。你留下的成长和本轮纪念资格仍在。",
    );
    setLeaving(false);
  }
  async function share() {
    setShareError("");
    try {
      await navigator.clipboard.writeText(
        window.location.origin + coopLink(coopId!),
      );
      setNotice("瓜田链接已复制，邀请大家一起种。");
    } catch {
      setShareError("暂时无法自动复制，请手动复制下面的瓜田链接。");
    }
  }
  function openCreate() {
    if (!user) {
      login();
      return;
    }
    setCreating(true);
    setWriteError("");
  }
  const sameWater = me?.todayWater?.coopId === coopId;
  const matureToday =
    !!garden?.maturedDay && garden.maturedDay >= detail!.today;
  const nextRound = !!garden?.maturedDay && garden.maturedDay < detail!.today;
  const waterDisabled = !canAct || !!me?.todayWater || matureToday;
  const waterLabel = busy
    ? "正在照料…"
    : matureToday
      ? "今日已成熟，明天再来"
      : sameWater
        ? "今天已在这里浇水"
        : me?.todayWater
          ? "今日浇水次数已用完"
          : nextRound
            ? "种下新一轮，浇水 +1"
            : "一起浇水 +1";
  return (
    <div className="coop-page">
      {coopId && (
        <a className="coop-back" href={appPath("/garden/coops")}>
          <ArrowLeft size={16} />
          返回合种大厅
        </a>
      )}
      <header className="coop-heading">
        <span>
          <Users size={16} />
          社区合种
        </span>
        <h1>{coopId ? garden?.name || "走进一块小瓜田" : "一起种瓜。"}</h1>
        <p>
          {coopId
            ? garden?.intro || "每天一点照料，长成属于大家的甜。"
            : "一个人的小期待，也可以长成一群人的收获。"}
        </p>
      </header>
      <Failure message={error} retry={() => void load()} />
      <Failure
        message={!creating && !editing ? writeError : ""}
        retry={() => void load()}
      />
      {notice && (
        <div className="coop-notice" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {meError && (
        <Failure
          message={"暂时无法读取你的参与状态：" + meError}
          retry={() => void load()}
        />
      )}
      {!coopId ? (
        <>
          {ready && !user ? (
            <section className="coop-signin" aria-label="参与合种">
              <Sprout size={26} />
              <div>
                <h2>一起，从一颗种子开始。</h2>
                <p>每人最多参与 3 块，登录后就能加入。</p>
              </div>
              <button className="button" onClick={login}>
                登录后参与
              </button>
            </section>
          ) : (
            <section
              className="coop-section coop-mine"
              aria-label="我参与的瓜田"
            >
              <div className="coop-section-heading">
                <div>
                  <h2>我参与的瓜田</h2>
                  <p>最多同时参与 3 块，每天选择一块浇水。</p>
                </div>
                <button
                  className="button"
                  onClick={openCreate}
                  disabled={
                    !ready ||
                    busy ||
                    (!!user && (!activeUser || !me || me.gardens.length >= 3))
                  }
                >
                  <Plus size={17} />
                  创建瓜田
                </button>
              </div>
              {!ready || (loading && !data) ? (
                <Skeleton />
              ) : !user ? (
                <div className="coop-empty">
                  <Sprout size={28} />
                  <h3>和瓜友一起，从一颗种子开始。</h3>
                  <p>公开瓜田可以直接浏览，登录后就能加入。</p>
                  <button className="text-link" onClick={login}>
                    登录后参与合种 →
                  </button>
                </div>
              ) : !activeUser ? (
                <p className="coop-muted">
                  账号参与权限已暂停，仍可浏览公开瓜田。
                </p>
              ) : me?.gardens.length ? (
                <div className="coop-grid">
                  {me.gardens.map((g) => (
                    <Card garden={g} key={g.id} />
                  ))}
                </div>
              ) : (
                <p className="coop-muted">还没有加入瓜田，去下面挑一块吧。</p>
              )}
              {me?.todayWater && (
                <p className="coop-daily">
                  <Check size={15} />
                  今天已在{" "}
                  <a href={coopLink(me.todayWater.coopId)}>
                    {me.todayWater.name}
                  </a>{" "}
                  浇水，明天再来。
                </p>
              )}
            </section>
          )}
          {creating && (
            <GardenForm
              error={writeError}
              busy={busy}
              onSave={create}
              onCancel={() => {
                setWriteError("");
                setCreating(false);
              }}
            />
          )}
          <section className="coop-section" aria-label="公开瓜田">
            <div className="coop-section-heading">
              <div>
                <h2>来认领一点共同的期待</h2>
                <p>每块最多 10 人 · 累计 35 次浇水成熟</p>
              </div>
              <span>{list?.total ?? "—"} 块瓜田</span>
            </div>
            <form
              className="coop-search"
              action={appPath("/garden/coops")}
              method="GET"
            >
              <label htmlFor="coop-search">寻找瓜田</label>
              <div>
                <input
                  id="coop-search"
                  name="q"
                  defaultValue={q}
                  maxLength={100}
                  placeholder="搜索瓜田名称或简介"
                />
                <button className="button secondary">搜索</button>
                {q && <a href={appPath("/garden/coops")}>清除</a>}
              </div>
            </form>
            {!list ? (
              loading ? (
                <Skeleton />
              ) : (
                <p className="coop-muted">暂时未能读取瓜田，请重试。</p>
              )
            ) : !list.items.length ? (
              <div className="coop-empty">
                <Sprout size={28} />
                <h3>{q ? "没有找到这块瓜田" : "第一块瓜田，等你开垦。"}</h3>
                <p>
                  {q
                    ? "换一个关键词，或看看其他公开瓜田。"
                    : "创建一块公开瓜田，邀请大家一起来种。"}
                </p>
              </div>
            ) : (
              <>
                <div className="coop-grid">
                  {list.items.map((g) => (
                    <Card garden={g} key={g.id} />
                  ))}
                </div>
                <Pagination
                  page={list.page}
                  totalPages={list.totalPages}
                  link={(p) =>
                    appPath(
                      "/garden/coops?" +
                        new URLSearchParams({ q, page: String(p) }),
                    )
                  }
                />
              </>
            )}
          </section>
          {me && <Memories me={me} busy={busy} onPage={setMemoryPage} />}
        </>
      ) : !detail ? (
        loading ? (
          <Skeleton />
        ) : (
          <div className="coop-empty">
            <h2>暂时没能走进这块瓜田</h2>
            <a href={appPath("/garden/coops")}>回大厅看看 →</a>
          </div>
        )
      ) : (
        <>
          <section className="coop-grow" aria-label="共享瓜苗">
            <div className="coop-grow-copy">
              <span className="coop-round">
                第 {garden!.round} 轮 · {GROWTH_STAGES[garden!.stage]}
              </span>
              <h2>
                {matureToday
                  ? "这一颗甜，属于大家。"
                  : nextRound
                    ? "新一轮，等你来播种。"
                    : "每一滴水，都算数。"}
              </h2>
              <p>
                {matureToday
                  ? "合种纪念已送给本轮每位贡献者，明天再种新的期待。"
                  : nextRound
                    ? "成熟的西瓜已经收好。今天首次浇水，会开启下一轮。"
                    : "不必每天都赶上。已经长大的，都会留在这里。"}
              </p>
              <Progress value={garden!.growth} />
              <div className="coop-actions">
                {!user ? (
                  <button className="button" disabled={!ready} onClick={login}>
                    <Users size={17} />
                    登录后加入
                  </button>
                ) : !activeUser ? (
                  <button className="button" disabled>
                    参与权限已暂停
                  </button>
                ) : !isMember ? (
                  <button
                    className="button"
                    disabled={
                      !canAct ||
                      garden!.memberCount >= 10 ||
                      (!!me && me.gardens.length >= 3)
                    }
                    onClick={() =>
                      void perform(
                        "/" + coopId + "/join",
                        "POST",
                        {},
                        "已加入瓜田，一起照料吧。",
                      )
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="garden-spin" size={17} />
                    ) : (
                      <Users size={17} />
                    )}{" "}
                    {garden!.memberCount >= 10
                      ? "成员已满 10 人"
                      : me && me.gardens.length >= 3
                        ? "已参与 3 块瓜田"
                        : "加入这块瓜田"}
                  </button>
                ) : (
                  <button
                    className="button"
                    disabled={waterDisabled}
                    onClick={() =>
                      void perform(
                        "/" + coopId + "/water",
                        "POST",
                        {},
                        "今日浇水已记下，一起离成熟更近一点。",
                      )
                    }
                  >
                    {busy ? (
                      <LoaderCircle className="garden-spin" size={17} />
                    ) : (
                      <Droplets size={17} />
                    )}{" "}
                    {waterLabel}
                  </button>
                )}
                <button
                  className="button secondary"
                  onClick={() => void share()}
                >
                  <Copy size={16} />
                  分享瓜田
                </button>
              </div>
              {me?.todayWater && !sameWater && (
                <p className="coop-daily">
                  今天已在{" "}
                  <a href={coopLink(me.todayWater.coopId)}>
                    {me.todayWater.name}
                  </a>{" "}
                  浇过水。
                </p>
              )}
              <small>北京时间每天 00:00 更新 · 每人每天全站浇水一次</small>
            </div>
            <div className="coop-art">
              <MelonPlant stage={garden!.stage} />
              <span>{garden!.memberCount} 位瓜友，一起照料</span>
            </div>
          </section>
          {shareError && (
            <div className="coop-share-fallback" role="status">
              <p>{shareError}</p>
              <a href={coopLink(coopId)}>
                {typeof window !== "undefined" ? window.location.origin : ""}
                {coopLink(coopId)}
              </a>
            </div>
          )}
          <div className="coop-toolbar">
            <span>
              <Users size={16} />
              {garden!.memberCount} / 10 人 · 共同收获 {garden!.harvestCount} 颗
            </span>
            <div>
              {isOwner && (
                <button
                  className="text-link"
                  disabled={busy}
                  onClick={() => {
                    setWriteError("");
                    setEditing((v) => !v);
                  }}
                >
                  <Pencil size={15} />
                  编辑介绍
                </button>
              )}
              {isMember && activeUser && (
                <button
                  ref={exitButton}
                  className="text-link"
                  disabled={busy}
                  aria-expanded={leaving}
                  aria-controls="coop-leave-confirmation"
                  onClick={() => setLeaving(true)}
                >
                  <LogOut size={15} />
                  退出瓜田
                </button>
              )}
            </div>
          </div>
          {leaving && isMember && (
            <section
              id="coop-leave-confirmation"
              className="coop-leave-confirmation"
              aria-labelledby="coop-leave-title"
            >
              <h2 id="coop-leave-title">确认退出「{garden!.name}」？</h2>
              <p>
                已有成长不会撤回，本轮合种纪念资格仍保留。
                {isOwner
                  ? "负责人会自动交接给其他正常成员；空田会等待新的瓜友接管。"
                  : "以后仍可重新加入有空位的瓜田。"}
              </p>
              <div className="coop-actions">
                <button
                  className="button secondary"
                  autoFocus
                  disabled={busy}
                  onClick={() => {
                    setLeaving(false);
                    exitButton.current?.focus();
                  }}
                >
                  继续一起种
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void leave()}
                >
                  确认退出
                </button>
              </div>
            </section>
          )}
          {editing && (
            <GardenForm
              error={writeError}
              garden={garden!}
              allowed={isOwner}
              busy={busy}
              onSave={(input) =>
                perform("/" + coopId, "PATCH", input, "瓜田介绍已更新。")
              }
              onCancel={() => {
                setWriteError("");
                setEditing(false);
              }}
            />
          )}
          <section className="coop-section" aria-label="瓜田成员">
            <div className="coop-section-heading">
              <h2>一起照料的人</h2>
              <span>本轮贡献 / 累计贡献</span>
            </div>
            {!detail.members.length ? (
              <p className="coop-muted">
                瓜田暂时无人照料。下一位加入的瓜友将接管它，原有成长仍保留。
              </p>
            ) : (
              <ul className="coop-members">
                {detail.members.map((m) => (
                  <li key={m.userId}>
                    <a
                      className="coop-avatar"
                      href={appPath("/u/" + m.userId)}
                      aria-label={m.nickname + "的主页"}
                    >
                      {m.nickname.slice(0, 1)}
                    </a>
                    <div>
                      <a href={appPath("/u/" + m.userId)}>{m.nickname}</a>
                      <p>
                        {garden!.ownerId === m.userId ? "负责人 · " : ""}
                        {!m.canParticipate
                          ? "暂停参与"
                          : m.wateredToday
                            ? "今日已在这里浇水"
                            : "一起慢慢长大"}
                      </p>
                    </div>
                    <strong>
                      {m.roundContribution}
                      <span> / {m.totalContribution}</span>
                    </strong>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="coop-history-grid">
            <section className="coop-section" aria-label="最近浇水">
              <div className="coop-section-heading">
                <h2>瓜田里的小动态</h2>
                <span>最近 20 次</span>
              </div>
              {!detail.activity.length ? (
                <p className="coop-muted">还没有水滴落下，第一滴可能来自你。</p>
              ) : (
                <ul className="coop-activity">
                  {detail.activity.map((a) => (
                    <li key={a.id}>
                      <Droplets size={15} />
                      <div>
                        <a href={appPath("/u/" + a.userId)}>{a.nickname}</a>
                        <span> 浇了一次水</span>
                        <small>
                          第 {a.round} 轮 · {date(a.createdAt)}
                        </small>
                      </div>
                      <b>+1</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="coop-section" aria-label="共同西瓜篮">
              <div className="coop-section-heading">
                <h2>共同的西瓜篮</h2>
                <span>{detail.total} 颗</span>
              </div>
              {!detail.harvests.length ? (
                <div className="coop-empty">
                  <span aria-hidden="true">🧺</span>
                  <h3>还差 {35 - garden!.growth} 次，就能一起收获。</h3>
                  <p>每轮的收获，只在这里记一颗。</p>
                </div>
              ) : (
                <>
                  <ul className="coop-records">
                    {detail.harvests.map((h) => (
                      <li key={h.round}>
                        <span className="coop-record-icon" aria-hidden="true">
                          🍉
                        </span>
                        <div>
                          <strong>第 {h.round} 颗共同的西瓜</strong>
                          <p>{h.contributors} 位贡献者留下合种纪念</p>
                          <time>{h.day}</time>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <Pagination
                    page={detail.page}
                    totalPages={detail.totalPages}
                    link={(p) => coopLink(coopId) + "?page=" + p}
                  />
                </>
              )}
            </section>
          </div>
          {me && <Memories me={me} busy={busy} onPage={setMemoryPage} />}
        </>
      )}
      <p className="coop-footnote">
        每人最多参与 3 块瓜田，每天只能给其中一块浇水。
        <br />
        个人签到独立计算；合种纪念不兑换奖励，也不增加个人西瓜数量。
      </p>
    </div>
  );
}
