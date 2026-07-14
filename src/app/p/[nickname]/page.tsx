"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OverviewBar } from "@/components/overview-bar";
import { RankChart } from "@/components/rank-chart";
import { HeroGrid } from "@/components/hero-grid";
import { MatchTable } from "@/components/match-table";

type DashData = {
  player: {
    gameNickname: string;
    campId: string;
    area: string;
    currentRank?: string | null;
    currentStars?: number;
    seasonGames?: number;
    seasonWins?: number;
    winRate?: number;
    mvpCount?: number;
    goldCount?: number;
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
  };
  matches: Array<{
    id: string;
    playedAt: string;
    modeName?: string | null;
    mode: string;
    heroName: string;
    result: string;
    kills: number;
    deaths: number;
    assists: number;
    score?: number | null;
    evaluate?: string | null;
  }>;
  heroStats: Array<{
    heroName: string;
    games: number;
    wins: number;
    winRate: number;
    avgKda: number;
    avgScore: number;
  }>;
  rankSeries: Array<{
    t: string;
    score: number | null;
    label?: string | null;
    stars?: number | null;
    result?: string;
    hero?: string;
  }>;
  total: number;
};

function PlayerDashboard() {
  const params = useParams<{ nickname: string }>();
  const searchParams = useSearchParams();
  const nickname = decodeURIComponent(params.nickname || "");

  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("30");
  const [mode, setMode] = useState("all");
  const [result, setResult] = useState("all");
  const [hero, setHero] = useState("");
  const [heroSort, setHeroSort] = useState<"games" | "winRate" | "avgScore">("games");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const h = searchParams.get("hero");
    if (h) setHero(h);
  }, [searchParams]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ range, mode, result });
    if (hero) qs.set("hero", hero);
    const res = await fetch(`/api/players/${encodeURIComponent(nickname)}?${qs}`);
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "加载失败");
      return;
    }
    setData(json.data);
    setError("");
  }, [nickname, range, mode, result, hero]);

  useEffect(() => {
    if (nickname) load().catch(() => setError("加载失败"));
  }, [load, nickname]);

  const sortedHeroes = useMemo(() => {
    if (!data?.heroStats) return [];
    return [...data.heroStats].sort((a, b) => b[heroSort] - a[heroSort]);
  }, [data, heroSort]);

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname, forceRefresh: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error || "刷新失败");
      } else {
        setMessage("已刷新最新战绩");
        setData(json.data);
      }
    } catch {
      setMessage("网络错误");
    } finally {
      setRefreshing(false);
    }
  }

  function share() {
    navigator.clipboard.writeText(window.location.href);
    setMessage("链接已复制");
  }

  if (error && !data) {
    return (
      <div className="panel p-8 text-center">
        <p className="text-[var(--crimson)]">{error}</p>
        <Link href="/" className="btn btn-primary mt-4">
          返回查询
        </Link>
      </div>
    );
  }

  if (!data) return <div className="text-[var(--muted)]">加载中…</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--gold-bright)]">
            {data.player.gameNickname}
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {data.player.area === "qq" ? "QQ 区" : "微信区"}
            {data.player.lastSyncAt
              ? ` · 同步于 ${new Date(data.player.lastSyncAt).toLocaleString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/" className="btn btn-ghost">
            查其他人
          </Link>
          <button className="btn btn-ghost" onClick={share}>
            分享
          </button>
          <button className="btn btn-primary" onClick={refresh} disabled={refreshing}>
            {refreshing ? "刷新中…" : "刷新战绩"}
          </button>
        </div>
      </div>

      {message && (
        <div className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3 text-sm">
          {message}
        </div>
      )}
      {data.player.lastSyncError && (
        <div className="rounded-xl border border-[rgba(196,92,74,0.4)] bg-[rgba(196,92,74,0.1)] px-4 py-3 text-sm text-[#f0b4aa]">
          同步提示：{data.player.lastSyncError}
        </div>
      )}

      <OverviewBar data={data.player} />

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--gold-bright)]">段位变化</h2>
          <select
            className="input !w-auto"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="all">全部</option>
          </select>
        </div>
        <RankChart data={data.rankSeries} />
      </section>

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--gold-bright)]">英雄使用</h2>
          <select
            className="input !w-auto"
            value={heroSort}
            onChange={(e) => setHeroSort(e.target.value as typeof heroSort)}
          >
            <option value="games">按场次</option>
            <option value="winRate">按胜率</option>
            <option value="avgScore">按评分</option>
          </select>
        </div>
        <HeroGrid
          heroes={sortedHeroes}
          basePath={`/p/${encodeURIComponent(data.player.gameNickname)}`}
        />
      </section>

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--gold-bright)]">
            近期对局{hero ? ` · ${hero}` : ""}
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              className="input !w-auto"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="all">全部模式</option>
              <option value="ranked">排位</option>
              <option value="peak">巅峰</option>
              <option value="fun">娱乐</option>
            </select>
            <select
              className="input !w-auto"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            >
              <option value="all">胜负</option>
              <option value="win">胜利</option>
              <option value="lose">失败</option>
            </select>
            {hero && (
              <button className="btn btn-ghost !py-2" onClick={() => setHero("")}>
                清除英雄筛选
              </button>
            )}
          </div>
        </div>
        <MatchTable matches={data.matches} />
        <p className="mt-3 text-xs text-[var(--muted)]">共 {data.total} 场</p>
      </section>
    </div>
  );
}

export default function PlayerPage() {
  return (
    <Suspense fallback={<div className="text-[var(--muted)]">加载中…</div>}>
      <PlayerDashboard />
    </Suspense>
  );
}
