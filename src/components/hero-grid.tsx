"use client";

import { fmtK } from "@/lib/format";

export type HeroRow = {
  heroName: string;
  heroIcon?: string | null;
  combatPower?: number | null;
  games: number;
  wins: number;
  winRate: number;
  avgKda?: number | null;
  avgKills?: number | null;
  avgDeaths?: number | null;
  avgAssists?: number | null;
  avgScore?: number | null;
  avgEconomyPerMin?: number | null;
  avgDamage?: number | null;
  avgTakenDamage?: number | null;
  avgJoinPct?: number | null;
};

function fmtInt(n: number) {
  return n.toLocaleString("zh-CN");
}

export function HeroGrid({
  heroes,
  onSelect,
}: {
  heroes: HeroRow[];
  onSelect?: (heroName: string) => void;
}) {
  if (!heroes.length) {
    return (
      <div className="py-8 text-center text-sm text-[var(--muted)]">暂无英雄数据</div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {heroes.map((h) => {
        const avgKdaText =
          h.avgKills != null && h.avgDeaths != null && h.avgAssists != null
            ? `${h.avgKills}/${h.avgDeaths}/${h.avgAssists}`
            : null;
        const stats = [
          h.combatPower != null ? ["英雄战力", fmtInt(h.combatPower)] : null,
          avgKdaText ? ["平均 K/D/A", avgKdaText] : null,
          h.avgScore != null ? ["平均战绩", String(h.avgScore)] : null,
          h.avgEconomyPerMin != null
            ? ["分均经济", String(h.avgEconomyPerMin)]
            : null,
          h.avgDamage != null ? ["场均输出", fmtK(h.avgDamage)] : null,
          h.avgTakenDamage != null
            ? ["场均承伤", fmtK(h.avgTakenDamage)]
            : null,
          h.avgJoinPct != null ? ["场均参团", `${h.avgJoinPct}%`] : null,
        ].filter(Boolean) as [string, string][];

        const inner = (
          <>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 font-semibold">
                {h.heroIcon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={h.heroIcon}
                    alt=""
                    className="h-7 w-7 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                <span className="truncate">{h.heroName}</span>
              </div>
              <span className="chip shrink-0">{h.games} 场</span>
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm text-[var(--muted)]">
              <span>胜率 {h.winRate}%</span>
              {h.avgKda != null && <span>KDA {h.avgKda}</span>}
            </div>
            {stats.length > 0 ? (
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                {stats.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[5.5rem_1fr] items-baseline gap-1.5">
                    <span className="text-right">{label}</span>
                    <span className="tabular-nums text-left text-white/80">{value}</span>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-[var(--teal)]"
                style={{ width: `${Math.min(100, h.winRate)}%` }}
              />
            </div>
          </>
        );

        return onSelect ? (
          <button
            key={h.heroName}
            type="button"
            onClick={() => onSelect(h.heroName)}
            className="panel block w-full p-4 text-left transition hover:border-[rgba(212,175,106,0.4)]"
          >
            {inner}
          </button>
        ) : (
          <div key={h.heroName} className="panel p-4">
            {inner}
          </div>
        );
      })}
    </div>
  );
}
