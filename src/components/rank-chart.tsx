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

type Point = {
  t: string;
  score: number | null;
  label?: string | null;
  stars?: number | null;
  result?: string;
  hero?: string;
};

function formatPointRank(p: Point & { score: number }) {
  if (p.label) {
    const name = String(p.label).replace(/\s*\d+\s*星\s*$/, "").trim();
    if (p.stars != null && p.stars >= 0) return `${name} ${p.stars}星`;
    return name || scoreToApproxLabel(p.score);
  }
  return scoreToApproxLabel(p.score);
}

export function RankChart({ data }: { data: Point[] }) {
  const chartData = data
    .filter((d) => d.score != null)
    .map((d) => ({
      ...d,
      score: d.score as number,
      time: format(new Date(d.t), "MM/dd HH:mm"),
    }));

  if (!chartData.length) {
    return (
      <div className="flex h-56 items-center justify-center text-sm text-[var(--muted)]">
        暂无段位曲线数据（需同步含段位信息的排位对局）
      </div>
    );
  }

  const scores = chartData.map((d) => d.score);
  const dataMin = Math.min(...scores);
  const dataMax = Math.max(...scores);
  const pad = Math.max(2, Math.ceil((dataMax - dataMin) * 0.2) || 2);
  const yMin = Math.max(0, dataMin - pad);
  const yMax = dataMax + pad;

  return (
    <ScrollableChart pointCount={chartData.length} height={256}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="rankFill" x1="0" y1="0" x2="0" y2="1">
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
            minTickGap={40}
          />
          <YAxis
            tick={{ fill: "#9aa6b8", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
            domain={[yMin, yMax]}
            allowDecimals={false}
            tickFormatter={(v) => scoreToApproxLabel(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#121a2b",
              border: "1px solid rgba(212,175,106,0.25)",
              borderRadius: 12,
            }}
            labelStyle={{ color: "#f0d78c" }}
            formatter={(_value, _name, item) => {
              const p = item?.payload as Point & { score: number; time: string };
              return [p ? formatPointRank(p) : scoreToApproxLabel(Number(_value ?? 0)), "段位"];
            }}
            labelFormatter={(_, payload) => {
              const p = payload?.[0]?.payload as Point & { time: string };
              if (!p) return "";
              return `${p.time}${p.hero ? ` · ${p.hero}` : ""}${p.result === "win" ? " · 胜" : p.result === "lose" ? " · 负" : ""}`;
            }}
          />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#f0d78c"
            strokeWidth={2}
            fill="url(#rankFill)"
            dot={{ r: 3, fill: "#f0d78c" }}
            activeDot={{ r: 5, fill: "#f0d78c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ScrollableChart>
  );
}
