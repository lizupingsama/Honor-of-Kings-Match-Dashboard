import type { Metadata } from "next";
import { Noto_Sans_SC, ZCOOL_XiaoWei } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { BasePathProvider } from "@/components/base-path-provider";
import { TrackBeacon } from "@/components/track-beacon";

const display = Noto_Sans_SC({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const titleFont = ZCOOL_XiaoWei({
  variable: "--font-title",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "王者战绩看板",
  description: "输入王者名称查询战绩、段位变化与英雄数据",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basePath = (
    process.env.NEXT_BASE_PATH ||
    process.env.NEXT_PUBLIC_BASE_PATH ||
    ""
  ).replace(/\/$/, "");

  return (
    <html lang="zh-CN" className={`${display.variable} ${titleFont.variable} h-full`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__WZRY_BASE_PATH__=${JSON.stringify(basePath)};`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        <BasePathProvider basePath={basePath}>
          <TrackBeacon />
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
          <footer className="border-t border-[var(--line)] py-6 text-center text-xs text-[var(--muted)]">
            输入王者名称即可查询 · 站内榜仅统计曾被查询同步过的玩家 · 非官方全服数据
          </footer>
        </BasePathProvider>
      </body>
    </html>
  );
}
