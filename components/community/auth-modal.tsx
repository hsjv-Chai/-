"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { api } from "./client";
import { X, LoaderCircle, ArrowRight } from "lucide-react";
import { ErrorBox } from "./display";

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
