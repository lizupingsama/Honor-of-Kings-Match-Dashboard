"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PowerZone } from "@/lib/hero-power-api";
import { apiFetch } from "@/lib/client-fetch";

type RangeKey = "8h" | "1d" | "7d";
type LevelKey = "province" | "city" | "district";

type HistoryPoint = {
  recordedAt: string;
  provincePowers: Record<string, number>;
  cityPower: number | null;
  districtPower: number | null;
  source: string;
};

type HistoryResponse = {
  monitor: {
    heroId: string;
    heroName: string;
    heroAvatar: string | null;
    zone: string;
    enabled: boolean;
    intervalHours: number;
    lastAttemptAt: string | null;
    lastSyncedAt: string | null;
    lastSyncError: string | null;
    nextSyncAt: string | null;
  } | null;
  range: RangeKey;
  points: HistoryPoint[];
};

const RANGES: { value: RangeKey; label: string }[] = [
  { value: "8h", label: "8 小时" },
  { value: "1d", label: "每天" },
  { value: "7d", label: "每周" },
];

const LEVELS: { value: LevelKey; label: string }[] = [
  { value: "province", label: "省标" },
  { value: "city", label: "市标" },
  { value: "district", label: "县标" },
];

function formatPower(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("zh-CN");
}

function valueForLevel(
  point: HistoryPoint | undefined,
  level: LevelKey,
  province: string,
) {
  if (!point) return null;
  if (level === "province") return point.provincePowers[province] ?? null;
  if (level === "city") return point.cityPower;
  return point.districtPower;
}

export function HeroPowerHistoryChart({
  heroId,
  zone,
}: {
  heroId: string;
  zone: PowerZone;
}) {
  const [range, setRange] = useState<RangeKey>("1d");
  const [level, setLevel] = useState<LevelKey>("province");
  const [provinceChoice, setProvinceChoice] = useState("");
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ heroId, zone, range });
    apiFetch(`/api/hero-power/history?${params}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "加载监测曲线失败");
          setData(null);
          return;
        }
        setData(json.data as HistoryResponse);
      })
      .catch(() => {
        if (!cancelled) setError("网络错误，无法加载监测曲线");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [heroId, zone, range, refreshKey]);

  const activeLevel = LEVELS.find((item) => item.value === level) || LEVELS[0];
  const provinceNames = useMemo(
    () =>
      Array.from(
        new Set(
          (data?.points || []).flatMap((point) =>
            Object.keys(point.provincePowers || {}),
          ),
        ),
      ).sort((a, b) => a.localeCompare(b, "zh-CN")),
    [data?.points],
  );
  const selectedProvince = provinceNames.includes(provinceChoice)
    ? provinceChoice
    : provinceNames[0] || "";
  const chartData = useMemo(
    () =>
      (data?.points || [])
        .map((point) => {
          const value = valueForLevel(point, level, selectedProvince);
          if (typeof value !== "number") return null;
          return {
            time: format(new Date(point.recordedAt), "MM/dd HH:mm"),
            fullTime: format(new Date(point.recordedAt), "yyyy-MM-dd HH:mm"),
            value,
            source: point.source,
          };
        })
        .filter(
          (point): point is {
            time: string;
            fullTime: string;
            value: number;
            source: string;
          } => Boolean(point),
        ),
    [data?.points, level, selectedProvince],
  );

  const latest = data?.points.at(-1);
  const latestProvincePower = valueForLevel(latest, "province", selectedProvince);
  const values = chartData.map((point) => point.value);
  const minValue = values.length ? Math.min(...values) : null;
  const maxValue = values.length ? Math.max(...values) : null;
  const yDomain =
    minValue == null || maxValue == null
      ? undefined
      : ([
          Math.max(0, minValue - Math.max(1, Math.ceil((maxValue - minValue) * 0.15))),
          maxValue + Math.max(1, Math.ceil((maxValue - minValue) * 0.15)),
        ] as [number, number]);

  function changeRange(nextRange: RangeKey) {
    if (nextRange === range) return;
    setError("");
    setLoading(true);
    setRange(nextRange);
  }

  function refresh() {
    setError("");
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }

  if (loading && !data) {
    return (
      <section className="panel px-5 py-6 text-sm text-[var(--muted)]">
        正在加载战力监测曲线…
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel px-5 py-6 text-sm text-[var(--crimson)]">{error}</section>
    );
  }

  if (!data?.monitor) {
    return (
      <section className="panel px-5 py-6">
        <h2 className="text-lg text-[var(--gold-bright)]">战力变化监测</h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          该英雄尚未加入当前区服的监测。管理员可在后台添加后，每 8 小时自动记录分省省标及市 / 县标最低门槛。
        </p>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg text-[var(--gold-bright)]">战力变化监测</h2>
            <span
              className={`rounded-full border px-2 py-0.5 text-[11px] ${
                data.monitor.enabled
                  ? "border-[rgba(61,155,143,0.45)] text-[var(--teal)]"
                  : "border-[var(--line)] text-[var(--muted)]"
              }`}
            >
              {data.monitor.enabled ? `每 ${data.monitor.intervalHours} 小时采集` : "已暂停"}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            省标为所选省份门槛，市标 / 县标为全国最低门槛；
            {data.monitor.lastSyncedAt
              ? `最近采集 ${format(new Date(data.monitor.lastSyncedAt), "MM-dd HH:mm")}`
              : "尚无采集记录"}
          </p>
          {data.monitor.lastSyncError && (
            <p className="mt-1 text-xs text-[var(--crimson)]">
              最近采集异常：{data.monitor.lastSyncError}
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost !px-3 !py-1.5 text-xs"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "刷新中…" : "刷新曲线"}
        </button>
      </div>

      <div className="space-y-5 p-5">
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map((item) => (
            <div
              key={item.value}
              className="rounded-xl border border-[var(--line)] bg-black/15 px-3 py-2.5"
            >
              <div className="text-xs text-[var(--muted)]">
                {item.value === "province"
                  ? `省标 · ${selectedProvince || "选择省份"}`
                  : `最低${item.label}战力`}
              </div>
              <div className="mt-1 truncate text-base font-semibold tabular-nums text-[var(--text)]">
                {formatPower(
                  item.value === "province"
                    ? latestProvincePower
                    : valueForLevel(latest, item.value, selectedProvince),
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-full border border-[var(--line)] p-1">
            {LEVELS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setLevel(item.value)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  level === item.value
                    ? "bg-[var(--gold)] text-[#1a1408]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {level === "province" && (
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              省份
              <select
                className="input !w-auto min-w-32 !py-1.5"
                value={selectedProvince}
                onChange={(event) => setProvinceChoice(event.target.value)}
                disabled={provinceNames.length === 0}
              >
                {provinceNames.length === 0 ? (
                  <option value="">暂无分省数据</option>
                ) : (
                  provinceNames.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))
                )}
              </select>
            </label>
          )}
          <div className="flex rounded-full border border-[var(--line)] p-1">
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => changeRange(item.value)}
                className={`rounded-full px-3 py-1 text-xs transition ${
                  range === item.value
                    ? "bg-[var(--teal)] text-[#071512]"
                    : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
            {level === "province" && !selectedProvince
              ? "暂无分省省标数据，等待下一次采集"
              : `当前时间跨度内暂无${activeLevel.label}数据`}
          </div>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
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
                  width={64}
                  domain={yDomain || ["auto", "auto"]}
                  allowDecimals={false}
                  tickFormatter={(value) => Number(value).toLocaleString("zh-CN")}
                />
                <Tooltip
                  contentStyle={{
                    background: "#121a2b",
                    border: "1px solid rgba(212,175,106,0.25)",
                    borderRadius: 12,
                  }}
                  labelStyle={{ color: "#f0d78c" }}
                  formatter={(value) => [
                    Number(value ?? 0).toLocaleString("zh-CN"),
                    level === "province"
                      ? `${selectedProvince}省标战力`
                      : `最低${activeLevel.label}战力`,
                  ]}
                  labelFormatter={(_, payload) => {
                    const point = payload?.[0]?.payload as
                      | { fullTime?: string; source?: string }
                      | undefined;
                    if (!point?.fullTime) return "";
                    const sourceLabel =
                      point.source === "manual"
                        ? " · 手动"
                        : point.source === "initial"
                          ? " · 初始"
                          : " · 自动";
                    return `${point.fullTime}${sourceLabel}`;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  name={
                    level === "province"
                      ? `${selectedProvince}省标战力`
                      : `最低${activeLevel.label}战力`
                  }
                  stroke="#f0d78c"
                  strokeWidth={2.5}
                  dot={{ r: 3.5, fill: "#f0d78c", strokeWidth: 0 }}
                  activeDot={{ r: 5.5, fill: "#f0d78c" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}
