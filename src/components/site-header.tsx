"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteHeader() {
  const pathname = usePathname();
  const active = (href: string) =>
    pathname === href || pathname.startsWith(href + "/") ? "active" : "";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(11,18,32,0.82)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Link href="/" className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-lg font-bold tracking-wide text-[var(--gold-bright)]">
            王者战绩看板
          </span>
          <span className="hidden text-xs text-[var(--muted)] sm:inline">按昵称查询</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm sm:justify-end sm:gap-4">
          <Link href="/" className={`nav-link ${pathname === "/" ? "active" : ""}`}>
            战绩
          </Link>
          <Link href="/hero-power" className={`nav-link ${active("/hero-power")}`}>
            战力查询
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
