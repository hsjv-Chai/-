"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { appPath } from "@/lib/paths";
import type { CoopMe } from "@/lib/garden/cooperative-model";

export async function coopRequest<T>(
  path: string,
  method = "GET",
  data?: object,
  signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, 15000);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  try {
    let response: Response;
    try {
      response = await fetch(appPath("/api/garden/coops" + path), {
        method,
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
        ...(data
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            }
          : {}),
      });
    } catch {
      throw new Error("暂时无法连接瓜田，请检查网络后重试");
    }
    let value: { error?: string };
    try {
      value = (await response.json()) as { error?: string };
    } catch {
      throw new Error("暂时无法读取瓜田，请稍后重试");
    }
    if (!response.ok)
      throw Object.assign(
        new Error(value.error || "暂时无法查看瓜田，请重试"),
        {
          status: response.status,
        },
      );
    return value as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function useCooperative<
  T extends { nextResetAt: number; serverNow: number },
>(path: string, activeUser: string | undefined, memoryPage: number) {
  const [data, setData] = useState<T | null>(null),
    [me, setMe] = useState<CoopMe | null>(null);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [meError, setMeError] = useState("");
  const sequence = useRef(0),
    mutating = useRef(false),
    pending = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (mutating.current) return;
    const seq = ++sequence.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const [publicResult, privateResult] = await Promise.allSettled([
      coopRequest<T>(path, "GET", undefined, controller.signal),
      activeUser
        ? coopRequest<CoopMe>(
            "/me?page=" + memoryPage,
            "GET",
            undefined,
            controller.signal,
          )
        : Promise.resolve(null),
    ]);
    if (pending.current === controller) pending.current = null;
    if (seq !== sequence.current) return;
    if (publicResult.status === "fulfilled") {
      setData(publicResult.value);
      setError("");
    } else setError(publicResult.reason.message);
    if (privateResult.status === "fulfilled") {
      setMe(privateResult.value);
      setMeError("");
    } else {
      setMe(null);
      setMeError(privateResult.reason.message);
    }
    setLoading(false);
  }, [path, activeUser, memoryPage]);
  useEffect(() => {
    let disposed = false;
    queueMicrotask(() => {
      if (!disposed) void load();
    });
    const refresh = () => {
      if (document.visibilityState === "visible" && !pending.current)
        void load();
    };
    const invalidate = () => {
      sequence.current++;
      pending.current?.abort();
      pending.current = null;
    };
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      invalidate();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(
      () => void load(),
      Math.max(100, data.nextResetAt - data.serverNow + 100),
    );
    return () => clearTimeout(timer);
  }, [data, load]);
  const beginMutation = () => {
    if (mutating.current) return false;
    mutating.current = true;
    sequence.current++;
    pending.current?.abort();
    pending.current = null;
    return true;
  };
  const endMutation = async () => {
    mutating.current = false;
    await load();
  };
  return {
    data,
    me,
    loading,
    error,
    meError,
    load,
    beginMutation,
    endMutation,
  };
}
