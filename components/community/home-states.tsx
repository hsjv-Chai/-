"use client";

import { AlertCircle, RotateCcw } from "lucide-react";

export function HomeLoading({ small = false }: { small?: boolean }) {
  return <div className={"home-loading" + (small ? " home-loading-small" : "")} role="status">
    <span className="home-sr-only">正在加载社区内容…</span>
    {Array.from({ length: small ? 3 : 2 }, (_, index) => <div className="home-skeleton" key={index} aria-hidden="true">
      <span /><span /><span />
    </div>)}
  </div>;
}

export function HomeError({ message, retry }: { message: string; retry: () => void }) {
  if (!message) return null;
  return <div className="home-error" role="alert">
    <AlertCircle size={18} /><p>{message}</p>
    <button onClick={retry}><RotateCcw size={15} />重试</button>
  </div>;
}
