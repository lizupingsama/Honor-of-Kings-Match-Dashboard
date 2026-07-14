import { formatRankLabel } from "@/lib/rank";

export function OverviewBar({
  data,
}: {
  data: {
    currentRank?: string | null;
    currentStars?: number;
    seasonGames?: number;
    seasonWins?: number;
    winRate?: number;
    mvpCount?: number;
    goldCount?: number;
    lastSyncAt?: string | Date | null;
    gameNickname?: string | null;
    campId?: string;
    area?: string;
  };
}) {
  const items = [
    {
      label: "段位",
      value: formatRankLabel(data.currentRank, data.currentStars ?? 0),
    },
    {
      label: "场次",
      value: String(data.seasonGames ?? 0),
    },
    {
      label: "胜率",
      value: `${data.winRate ?? 0}%`,
    },
    {
      label: "MVP",
      value: String(data.mvpCount ?? 0),
    },
    {
      label: "金牌",
      value: String(data.goldCount ?? 0),
    },
  ];

  return (
    <div className="panel fade-in grid gap-4 p-5 sm:grid-cols-5">
      {items.map((item) => (
        <div key={item.label}>
          <div className="text-xs text-[var(--muted)]">{item.label}</div>
          <div className="mt-1 text-xl font-semibold text-[var(--gold-bright)]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
