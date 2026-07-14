"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const active = (href: string) =>
    pathname === href || pathname.startsWith(href + "/") ? "active" : "";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(11,18,32,0.82)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-wide text-[var(--gold-bright)]">
            王者战绩看板
          </span>
          <span className="hidden text-xs text-[var(--muted)] sm:inline">按昵称查询</span>
        </Link>
        <nav className="flex flex-wrap items-center justify-end gap-3 text-sm sm:gap-4">
          <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
            查询
          </Link>
          <Link href="/leaderboard" className={`nav-link ${active("/leaderboard")}`}>
            排行榜
          </Link>
          <Link href="/admin" className={`nav-link ${active("/admin")}`}>
            后台
          </Link>
        </nav>
      </div>
    </header>
  );
}
