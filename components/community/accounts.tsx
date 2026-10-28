"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User, ManagedAccount } from "./types";
import { useData } from "./use-data";
import { api } from "./client";
import { Loading, ErrorBox, Empty } from "./display";
import { X, Search, ShieldAlert } from "lucide-react";
type Audit = {
  id: string;
  action: string;
  reason: string;
  created_at: number;
  actor_nickname: string;
  actor_username: string;
};
type AccountPage = {
  items: ManagedAccount[];
  total: number;
  page: number;
  pageSize: number;
  registrationAlert: { created_at: number; account_count: number } | null;
};
const statusNames = { active: "正常", restricted: "限制中", banned: "已封禁" };
const date = (value: number) =>
  new Date(value).toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });
function Pager({
  page,
  total,
  setPage,
}: {
  page: number;
  total: number;
  setPage: (v: number) => void;
}) {
  return (
    <div className="account-pagination">
      <button
        className="button secondary"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        上一页
      </button>
      <span>
        第 {page} / {Math.max(1, Math.ceil(total / 20))} 页 · {total} 条
      </span>
      <button
        className="button secondary"
        disabled={page * 20 >= total}
        onClick={() => setPage(page + 1)}
      >
        下一页
      </button>
    </div>
  );
}
function AccountAction({
  target,
  close,
  done,
}: {
  target: ManagedAccount;
  close: () => void;
  done: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const action = target.account_status === "active" ? "ban" : "unban";
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("admin/users/" + target.id, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      done();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      className="auth-dialog"
      ref={dialog}
      aria-labelledby="account-action-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <button
        className="icon-button close-dialog"
        disabled={busy}
        aria-label="关闭"
        onClick={close}
      >
        <X size={20} />
      </button>
      <h2 id="account-action-title">
        确认{action === "ban" ? "封禁" : "解封"} {target.nickname}？
      </h2>
      <p>@{target.username}</p>
      <p>
        {action === "ban"
          ? "若正在对局，将暂停其他参与操作，并在当前整场牌局结束后封禁。掼蛋可继续打至整场结束。"
          : "解封后恢复参与权限，已退出的用户需要重新登录。"}
      </p>
      <form onSubmit={submit}>
        <label>
          操作原因
          <textarea
            autoFocus
            required
            maxLength={200}
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={busy}
          />
        </label>
        <ErrorBox message={error} />
        <button className="button" disabled={busy || !reason.trim()}>
          {busy ? "提交中…" : "确认" + (action === "ban" ? "封禁" : "解封")}
        </button>
      </form>
    </dialog>
  );
}
function AuditHistory({
  userId,
  version,
}: {
  userId: string;
  version: number;
}) {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useData<{ items: Audit[]; total: number }>(
    `admin/users/${userId}/audit?page=${page}`,
    version,
  );
  return (
    <section className="account-history" aria-label="账号操作记录">
      <h4>操作记录</h4>
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((item) => (
          <div key={item.id}>
            <strong>{item.action === "ban" ? "封禁" : "解封"}</strong>
            <span>
              {" "}
              · {item.actor_nickname}（@{item.actor_username}） ·{" "}
              {date(item.created_at)}
            </span>
            <p>{item.reason}</p>
          </div>
        ))
      ) : (
        <p>暂无操作记录</p>
      )}
      {data && data.total > 20 && (
        <Pager page={page} total={data.total} setPage={setPage} />
      )}
    </section>
  );
}
export function Accounts({
  admin,
  version,
  refresh,
  notify,
}: {
  admin: User;
  version: number;
  refresh: () => void;
  notify: (s: string) => void;
}) {
  const [emailFilter, setEmailFilter] = useState(""),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1),
    [alert, setAlert] = useState(""),
    [target, setTarget] = useState<ManagedAccount | null>(null),
    [history, setHistory] = useState("");
  const params = new URLSearchParams({
    q: search,
    ...(emailFilter ? { email: emailFilter } : {}),
    status,
    page: String(page),
    ...(alert ? { alert } : {}),
  });
  const { data, error, loading } = useData<AccountPage>(
    "admin/users?" + params,
    version,
  );
  function find(e: FormEvent) {
    e.preventDefault();
    setSearch(query.trim());
    setPage(1);
  }
  return (
    <div className="accounts-panel">
      <p className="muted">
        集中注册标记仅供人工判断，共用网络也可能触发，不会自动封禁。时间均为北京时间。
      </p>
      <form className="account-filters" onSubmit={find}>
        <label>
          <span className="sr-only">搜索用户名或昵称</span>
          <input
            maxLength={100}
            placeholder="搜索用户名或昵称"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <button className="button" type="submit">
          <Search size={16} />
          搜索
        </button>
        <label>
          <span className="sr-only">账号状态</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部账号</option>
            <option value="active">正常</option>
            <option value="restricted">限制中</option>
            <option value="banned">已封禁</option>
            <option value="suspicious">可疑注册</option>
          </select>
        </label>
      </form>
      {alert && (
        <div className="account-notice">
          正在查看同批注册账号
          {data?.registrationAlert && (
            <>
              {" "}
              · {date(data.registrationAlert.created_at)} · 共{" "}
              {data.registrationAlert.account_count} 个
            </>
          )}
          <button
            className="text-link"
            onClick={() => {
              setAlert("");
              setPage(1);
            }}
          >
            清除同批筛选
          </button>
        </div>
      )}
      {emailFilter && (
        <div className="account-notice">
          同邮箱账号：{emailFilter}
          <button
            className="text-link"
            onClick={() => {
              setEmailFilter("");
              setPage(1);
            }}
          >
            清除邮箱筛选
          </button>
        </div>
      )}
      <ErrorBox message={error} />
      {loading ? (
        <Loading />
      ) : data?.items.length ? (
        data.items.map((u) => (
          <article className="account-item" key={u.id}>
            <div className="account-heading">
              <h3>
                {u.nickname} <small>@{u.username}</small>
              </h3>
              <span className={"account-status status-" + u.account_status}>
                {statusNames[u.account_status]}
              </span>
            </div>
            <dl className="account-meta">
              <div>
                <dt>角色</dt>
                <dd>{u.role === "admin" ? "管理员" : "瓜友"}</dd>
              </div>
              <div>
                <dt>注册时间</dt>
                <dd>{date(u.created_at)}</dd>
              </div>
              <div>
                <dt>注册 IP</dt>
                <dd>{u.registration_ip || "未知"}</dd>
              </div>
              <div>
                <dt>注册邮箱</dt>
                <dd>{u.email || "历史账号，未绑定邮箱"}</dd>
              </div>
              {u.email_verified_at && (
                <div>
                  <dt>邮箱验证时间</dt>
                  <dd>{date(u.email_verified_at)}</dd>
                </div>
              )}
              {u.email && (
                <div>
                  <dt>邮箱累计账号</dt>
                  <dd>
                    {u.email_account_count} / 10{" "}
                    <button
                      className="text-link"
                      onClick={() => {
                        setEmailFilter(u.email_canonical!);
                        setAlert("");
                        setSearch("");
                        setQuery("");
                        setStatus("");
                        setPage(1);
                      }}
                    >
                      查看同邮箱账号
                    </button>
                  </dd>
                </div>
              )}
            </dl>
            {u.suspicious_at && (
              <div className="registration-warning">
                <ShieldAlert size={17} />
                <div>
                  <strong>同 IP 集中注册</strong>
                  <p>
                    {date(u.suspicious_at)} · 滚动 10 分钟内成功注册{" "}
                    {u.suspicious_count} 个账号
                  </p>
                  <button
                    className="text-link"
                    onClick={() => {
                      setAlert(u.alert_id!);
                      setSearch("");
                      setQuery("");
                      setStatus("");
                      setPage(1);
                    }}
                  >
                    查看同批账号
                  </button>
                </div>
              </div>
            )}
            {u.ban_reason && (
              <p className="account-reason">
                {u.account_status === "restricted"
                  ? "等待当前整场牌局结束 · "
                  : ""}
                原因：{u.ban_reason}
              </p>
            )}
            <div className="admin-actions">
              <button
                onClick={() => setHistory(history === u.id ? "" : u.id)}
                aria-expanded={history === u.id}
              >
                {history === u.id ? "收起记录" : "操作记录"}
              </button>
              {u.role !== "admin" && u.id !== admin.id && (
                <button onClick={() => setTarget(u)}>
                  {u.account_status === "active" ? "封禁账号" : "解封账号"}
                </button>
              )}
            </div>
            {history === u.id && (
              <AuditHistory key={u.id} userId={u.id} version={version} />
            )}
          </article>
        ))
      ) : (
        <Empty title="没有符合条件的账号" />
      )}
      {data && <Pager page={page} total={data.total} setPage={setPage} />}
      {target && (
        <AccountAction
          target={target}
          close={() => setTarget(null)}
          done={() => {
            setTarget(null);
            refresh();
            notify("账号状态已更新");
          }}
        />
      )}
    </div>
  );
}
