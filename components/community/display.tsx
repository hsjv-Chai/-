"use client";

import { type AnchorHTMLAttributes, type ReactNode } from "react";
import { appPath } from "@/lib/paths";
import {
  LoaderCircle,
  AlertCircle,
  Flame,
  Radio,
  Popcorn,
  Monitor,
  Coffee,
} from "lucide-react";

// Keep document navigation: Vinext beta prefetch is not used by this app.
export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={props.href ? appPath(props.href) : undefined} />;
}

export function relative(time: number) {
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

export function Avatar({
  name,
  large = false,
}: {
  name: string;
  large?: boolean;
}) {
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

export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <span>🍃</span>
      <h3>{title}</h3>
      <p>{children || "换个关键词，或者来聊点新鲜的吧。"}</p>
    </div>
  );
}

export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" /> 正在搬来新鲜的瓜…
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div role="alert" className="error">
      <AlertCircle size={16} />
      {message}
    </div>
  ) : null;
}

export const icons: Record<string, typeof Flame> = {
  hot: Radio,
  fun: Popcorn,
  tech: Monitor,
  life: Coffee,
};
