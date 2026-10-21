import {appPath} from "@/lib/paths";
import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "🍉 · 好瓜，一起聊",
  description: "有趣的事，值得一起聊。一个轻松、友善的热点讨论社区。",
  icons: { icon: appPath("/favicon.svg") },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
