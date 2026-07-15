"use client";

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
