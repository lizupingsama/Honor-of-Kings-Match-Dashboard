import { formatRankLabel } from "@/lib/rank";

function areaLabel(area?: string) {
  if (area === "qq") return "QQ 区";
  if (area === "wechat") return "微信区";
  return area || "—";
}

export function OverviewBar({
  data,
}: {
  data: {
    currentRank?: string | null;
    currentStars?: number;
    rankScore?: number;
    peakRating?: number;
    peakScore?: number;
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
      label: "排位评分",
      value: data.rankScore != null && data.rankScore > 0 ? String(data.rankScore) : "—",
    },
    {
      label: "巅峰评分",
      value:
        data.peakRating != null && data.peakRating > 0 ? String(data.peakRating) : "—",
    },
    {
      label: "巅峰分",
      value: data.peakScore && data.peakScore > 0 ? String(data.peakScore) : "—",
    },
    {
      label: "赛季场次",
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
    {
      label: "区服",
      value: areaLabel(data.area),
    },
  ];

  return (
    <div className="panel fade-in grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
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
