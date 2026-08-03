"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { scoreToApproxLabel } from "@/lib/rank";
import { ScrollableChart } from "@/components/scrollable-chart";

export type TrendPoint = {
  t: string;
  value: number;
  source?: string;
};

const METRIC_LABEL: Record<string, string> = {
  rankScore: "排位评分",
  peakRating: "巅峰评分",
  peakScore: "巅峰分",
  combatPower: "英雄战力",
  winRate: "胜率",
};

export function ScoreTrendChart({
  data,
  metric,
  height = 220,
  /** 段位曲线才用段位标签；评分曲线一律显示数值 */
  yAsRankLabel = false,
  yDomain,
}: {
  data: TrendPoint[];
  metric: "rankScore" | "peakRating" | "peakScore" | "combatPower" | "winRate";
  height?: number;
  yAsRankLabel?: boolean;
  yDomain?: [number, number];
}) {
  const chartData = data.map((d) => ({
    ...d,
    time: format(new Date(d.t), "MM/dd HH:mm"),
  }));

  if (!chartData.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-[var(--muted)]"
        style={{ height }}
      >
        暂无{METRIC_LABEL[metric] || "数据"}曲线
      </div>
    );
  }

  const formatY = (v: number) => {
    if (yAsRankLabel) return scoreToApproxLabel(v);
    if (metric === "winRate") return `${v}%`;
    return String(v);
  };

  const gradId = `scoreFill-${metric}-${yAsRankLabel ? "rank" : "num"}`;

  return (
    <ScrollableChart pointCount={chartData.length} height={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#d4af6a" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#d4af6a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#9aa6b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            tick={{ fill: "#9aa6b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={yDomain || ["auto", "auto"]}
            tickFormatter={(v) => formatY(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#121a2b",
              border: "1px solid rgba(212,175,106,0.25)",
              borderRadius: 12,
            }}
            labelStyle={{ color: "#f0d78c" }}
            formatter={(value) => [
              yAsRankLabel
                ? `${scoreToApproxLabel(Number(value ?? 0))}（${value}）`
                : metric === "winRate"
                  ? `${value}%`
                  : String(value ?? 0),
              METRIC_LABEL[metric],
            ]}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as TrendPoint & { time: string };
              if (!p) return "";
              return `${p.time}${p.source === "manual" ? " · 手动" : p.source === "sync" ? " · 同步" : ""}`;
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#f0d78c"
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={{ r: 3, fill: "#f0d78c" }}
            activeDot={{ r: 5, fill: "#f0d78c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ScrollableChart>
  );
}
