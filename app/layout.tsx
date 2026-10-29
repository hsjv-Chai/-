import { appPath } from "@/lib/paths";
import type { Metadata } from "next";
import "./globals.css";
import "./community.css";
import "./home.css";
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
  const filing = process.env.MELON_ICP_NUMBER?.trim();
  const showFiling =
    filing && /^[\u4e00-\u9fff]ICP备[0-9]{6,16}号(?:-[0-9]+)?$/.test(filing);
  return (
    <html lang="zh-CN">
      <body>
        {children}
        {showFiling && (
          <footer className="filing-footer">
            <a
              href="https://beian.miit.gov.cn/"
              target="_blank"
              rel="noopener noreferrer"
            >
              {filing}
            </a>
          </footer>
        )}
      </body>
    </html>
  );
}
