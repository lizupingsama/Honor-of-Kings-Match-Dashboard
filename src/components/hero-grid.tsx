"use client";

import Link from "next/link";

export type HeroRow = {
  heroName: string;
  heroIcon?: string | null;
  games: number;
  wins: number;
  winRate: number;
  avgKda?: number | null;
  avgScore?: number | null;
};

export function HeroGrid({
  heroes,
  basePath,
}: {
  heroes: HeroRow[];
  basePath?: string;
}) {
  if (!heroes.length) {
    return (
      <div className="py-8 text-center text-sm text-[var(--muted)]">暂无英雄数据</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {heroes.map((h) => {
        const inner = (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold">{h.heroName}</div>
              <span className="chip">{h.games} 场</span>
            </div>
            <div className="mt-3 flex justify-between text-sm text-[var(--muted)]">
              <span>胜率 {h.winRate}%</span>
              {h.avgKda != null && <span>KDA {h.avgKda}</span>}
              {h.avgScore != null && <span>评分 {h.avgScore}</span>}
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-[var(--teal)]"
                style={{ width: `${Math.min(100, h.winRate)}%` }}
              />
            </div>
          </>
        );

        return basePath ? (
          <Link
            key={h.heroName}
            href={`${basePath}?hero=${encodeURIComponent(h.heroName)}`}
            className="panel block p-4 transition hover:border-[rgba(212,175,106,0.4)]"
          >
            {inner}
          </Link>
        ) : (
          <div key={h.heroName} className="panel p-4">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
