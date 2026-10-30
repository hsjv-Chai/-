"use client";
import { useState, useEffect, useId, type FormEvent } from "react";
import { api } from "./client";
import { X, LoaderCircle, ArrowRight, Mail } from "lucide-react";
import { ErrorBox } from "./display";
import { normalizeEmail } from "@/lib/email/model";
import { useAuthDialog } from "./use-auth-dialog";
export function AuthModal({
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
    [sending, setSending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [username, setUsername] = useState(""),
    [nickname, setNickname] = useState(""),
    [password, setPassword] = useState(""),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [retryAt, setRetryAt] = useState(0),
    [time, setTime] = useState(() => Date.now());
  const dialog = useAuthDialog();
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const timer = setInterval(() => setTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  function changed() {
    setError("");
    if (challenge) {
      setChallenge("");
      setCode("");
      setNotice("用户名或邮箱已更改，请重新获取验证码");
    }
  }
  const remaining = Math.max(0, Math.ceil((retryAt - time) / 1000));
  async function send() {
    setError("");
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
      setError("请先填写 3–24 位字母、数字或下划线组成的用户名");
      return;
    }
    try {
      normalizeEmail(email);
    } catch {
      setError("请填写有效邮箱");
      return;
    }
    setSending(true);
    try {
      const response = await api<{ challengeId: string; retryAfter: number }>(
        "auth/email-code",
        { method: "POST", body: JSON.stringify({ username, email }) },
      );
      setChallenge(response.challengeId);
      setCode("");
      setRetryAt(Date.now() + response.retryAfter * 1000);
      setTime(Date.now());
      setNotice("验证码已发送，有效期 10 分钟。请查看收件箱或垃圾邮件。");
    } catch (e) {
      const failure = e as Error & { retryAfter?: number };
      setError(failure.message);
      if (failure.retryAfter) {
        setRetryAt(Date.now() + failure.retryAfter * 1000);
        setTime(Date.now());
      }
    } finally {
      setSending(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register" && !challenge)
        throw new Error("请先获取邮箱验证码");
      await api("auth/" + mode, {
        method: "POST",
        body: JSON.stringify({
          username,
          password,
          ...(mode === "register"
            ? { nickname, email, code, challengeId: challenge }
            : {}),
        }),
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
      ref={dialog}
      className="auth-dialog auth-modal"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy && !sending) close();
      }}
    >
      <button
        className="icon-button close-dialog"
        aria-label="关闭"
        disabled={busy || sending}
        onClick={close}
      >
        <X size={20} />
      </button>
      <div className="auth-modal-content">
        <div className="auth-fruit">🍉</div>
        <h2 id={titleId}>
          {mode === "login" ? "好久不见，瓜友。" : "留个名字，一起吃瓜。"}
        </h2>
        <p id={descriptionId}>
          {mode === "login"
            ? "一点好奇心，一群聊得来的人。"
            : "验证你的邮箱，让每个名字都有来处。"}
        </p>
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
              value={username}
              disabled={busy || sending}
              onChange={(e) => {
                changed();
                setUsername(e.target.value);
              }}
            />
          </label>
          {mode === "register" && (
            <>
              <label>
                昵称
                <input
                  name="nickname"
                  required
                  minLength={2}
                  maxLength={20}
                  autoComplete="nickname"
                  placeholder="大家怎么称呼你？"
                  value={nickname}
                  disabled={busy}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </label>
              <label>
                邮箱
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="用于接收注册验证码"
                  value={email}
                  disabled={busy || sending}
                  onChange={(e) => {
                    changed();
                    try {
                      if (
                        normalizeEmail(e.target.value).canonical !==
                        normalizeEmail(email).canonical
                      )
                        setRetryAt(0);
                    } catch {
                      setRetryAt(0);
                    }
                    setEmail(e.target.value);
                  }}
                />
              </label>
              <div className="email-code-row">
                <label>
                  邮箱验证码
                  <input
                    name="code"
                    required
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    placeholder="6 位数字"
                    value={code}
                    disabled={busy}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  type="button"
                  disabled={busy || sending || remaining > 0}
                  onClick={send}
                >
                  {sending ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Mail size={16} />
                  )}{" "}
                  {sending
                    ? "发送中…"
                    : remaining > 0
                      ? `${remaining} 秒后重发`
                      : challenge
                        ? "重新获取"
                        : "获取验证码"}
                </button>
              </div>
              <small className="email-quota-note">
                每个邮箱累计最多注册 10 个账号；Gmail 常见别名共用名额。
              </small>
            </>
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
              value={password}
              disabled={busy}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {notice && mode === "register" && (
            <p className="email-code-notice" role="status">
              {notice}
            </p>
          )}
          <ErrorBox message={error} />
          <button className="button full" disabled={busy || sending}>
            {busy && <LoaderCircle className="spin" size={17} />}{" "}
            {mode === "login" ? "登录，加入讨论" : "验证并注册"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="auth-switch">
          {mode === "login" ? "还没有账号？" : "已经有账号？"}
          <button
            disabled={busy || sending}
            onClick={() => {
              setError("");
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? "来这里注册" : "直接登录"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
