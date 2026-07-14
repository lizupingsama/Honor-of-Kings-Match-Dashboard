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

type Point = {
  t: string;
  score: number | null;
  label?: string | null;
  stars?: number | null;
  result?: string;
  hero?: string;
};

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

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
            width={56}
            tickFormatter={(v) => scoreToApproxLabel(Number(v))}
          />
          <Tooltip
            contentStyle={{
              background: "#121a2b",
              border: "1px solid rgba(212,175,106,0.25)",
              borderRadius: 12,
            }}
            labelStyle={{ color: "#f0d78c" }}
            formatter={(value) => [
              scoreToApproxLabel(Number(value ?? 0)),
              "段位",
            ]}
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
            dot={false}
            activeDot={{ r: 4, fill: "#f0d78c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
