"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { OverviewBar } from "@/components/overview-bar";
import { RankChart } from "@/components/rank-chart";
import { ScoreTrendChart } from "@/components/score-trend-chart";
import { HeroGrid } from "@/components/hero-grid";
import { MatchTable } from "@/components/match-table";
import { PlayerLikeButton } from "@/components/player-like-button";
import { PlayerAvatar } from "@/components/player-avatar";
import { apiFetch } from "@/lib/client-fetch";

type DashData = {
  player: {
    gameNickname: string;
    campId: string;
    area: string;
    gameAvatarUrl?: string | null;
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
    lastSyncAt?: string | null;
    lastSyncError?: string | null;
    likeCount?: number;
  };
  matches: Array<{
    id: string;
    playedAt: string;
    modeName?: string | null;
    mode: string;
    heroName: string;
    heroIcon?: string | null;
    result: string;
    kills: number;
    deaths: number;
    assists: number;
    score?: number | null;
    evaluate?: string | null;
    medal?: string | null;
    medalIcon?: string | null;
    mvp?: boolean;
    mvpType?: string | null;
    mvpIcon?: string | null;
    gold?: boolean;
    economy?: number | null;
    economyPct?: number | null;
    damage?: number | null;
    damagePct?: number | null;
    takenDamage?: number | null;
    takenDamagePct?: number | null;
    joinPct?: number | null;
    equips?: Array<{
      equipId: number;
      equipIcon: string;
      equipName: string;
    }> | null;
  }>;
  heroStats: Array<{
    heroName: string;
    heroIcon?: string | null;
    combatPower?: number | null;
    games: number;
    wins: number;
    winRate: number;
    avgKda: number;
    avgKills?: number;
    avgDeaths?: number;
    avgAssists?: number;
    avgScore: number;
    avgEconomyPerMin?: number | null;
    avgDamage?: number | null;
    avgTakenDamage?: number | null;
    avgJoinPct?: number | null;
  }>;
  rankSeries: Array<{
    t: string;
    score: number | null;
    label?: string | null;
    stars?: number | null;
    result?: string;
    hero?: string;
  }>;
  peakSeries: Array<{
    t: string;
    value: number;
    result?: string;
    hero?: string;
  }>;
  total: number;
  wins?: number;
  matchWinRate?: number;
  matchAvgKda?: number;
  matchAvgScore?: number;
  page?: number;
  pageSize?: number;
  syncStatus?: {
    status: "idle" | "running" | "success" | "failed";
    message?: string | null;
    pulled?: number;
  };
};

function PlayerDashboard() {
  const params = useParams<{ nickname: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const nickname = decodeURIComponent(params.nickname || "");
  const matchesRef = useRef<HTMLElement>(null);
  const matchesSentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);
  const matchPageRef = useRef(1);

  const [data, setData] = useState<DashData | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("30");
  const [mode, setMode] = useState("all");
  const [result, setResult] = useState("all");
  const [side, setSide] = useState("all");
  const [hero, setHero] = useState("");
  const [heroSort, setHeroSort] = useState<"games" | "winRate" | "avgScore">("games");
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [matchPage, setMatchPage] = useState(1);
  const [hasMoreMatches, setHasMoreMatches] = useState(false);
  const [loadingMoreMatches, setLoadingMoreMatches] = useState(false);
  const wasSyncingRef = useRef(false);

  matchPageRef.current = matchPage;

  useEffect(() => {
    const h = searchParams.get("hero");
    if (h) setHero(h);
  }, [searchParams]);

  function syncHeroInUrl(nextHero: string) {
    const qs = new URLSearchParams(searchParams.toString());
    if (nextHero) qs.set("hero", nextHero);
    else qs.delete("hero");
    const query = qs.toString();
    router.replace(
      `/p/${encodeURIComponent(nickname)}${query ? `?${query}` : ""}`,
      { scroll: false },
    );
  }

  function selectHero(name: string) {
    setHero(name);
    syncHeroInUrl(name);
    requestAnimationFrame(() => {
      matchesRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function clearHero() {
    setHero("");
    syncHeroInUrl("");
  }

  const applyMatchPageMeta = useCallback((dash: DashData, pageNum: number) => {
    const pageSize = dash.pageSize || 100;
    setMatchPage(pageNum);
    setHasMoreMatches(pageNum * pageSize < dash.total);
  }, []);

  const load = useCallback(
    async (opts?: { page?: number; append?: boolean }) => {
      const pageNum = opts?.page ?? 1;
      const append = opts?.append ?? false;
      const qs = new URLSearchParams({
        range,
        mode,
        result,
        side,
        page: String(pageNum),
      });
      if (hero) qs.set("hero", hero);
      const res = await apiFetch(
        `/api/players/${encodeURIComponent(nickname)}?${qs}`,
      );
      const json = await res.json();
      if (!json.ok) {
        if (!append) setError(json.error || "加载失败");
        return;
      }
      const dash = json.data as DashData;
      setData((prev) => {
        if (!append || !prev) return dash;
        const seen = new Set(prev.matches.map((m) => m.id));
        const added = dash.matches.filter((m) => !seen.has(m.id));
        return { ...dash, matches: [...prev.matches, ...added] };
      });
      applyMatchPageMeta(dash, pageNum);
      setError("");
    },
    [nickname, range, mode, result, side, hero, applyMatchPageMeta],
  );

  useEffect(() => {
    if (nickname) load().catch(() => setError("加载失败"));
  }, [load, nickname]);

  useEffect(() => {
    const el = matchesSentinelRef.current;
    if (!el || !hasMoreMatches) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMoreRef.current) return;
        loadingMoreRef.current = true;
        setLoadingMoreMatches(true);
        load({ page: matchPageRef.current + 1, append: true })
          .catch(() => {})
          .finally(() => {
            loadingMoreRef.current = false;
            setLoadingMoreMatches(false);
          });
      },
      { rootMargin: "240px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreMatches, load]);

  const syncing = data?.syncStatus?.status === "running";

  useEffect(() => {
    if (!syncing) {
      if (wasSyncingRef.current) {
        wasSyncingRef.current = false;
        setRefreshing(false);
        // 仅成功时提示「同步完成」；失败由 lastSyncError / syncStatus.message 展示
        if (data?.syncStatus?.status === "failed") {
          setMessage("");
        } else {
          setMessage("同步完成");
        }
      }
      return;
    }
    wasSyncingRef.current = true;
    // 详情逐场入库，稍密轮询以便界面尽快跟上
    const timer = setInterval(() => {
      load().catch(() => {});
    }, 800);
    return () => clearInterval(timer);
  }, [syncing, load, data?.syncStatus?.status]);

  const sortedHeroes = useMemo(() => {
    if (!data?.heroStats) return [];
    return [...data.heroStats].sort((a, b) => b[heroSort] - a[heroSort]);
  }, [data, heroSort]);

  const rankPointCount = useMemo(
    () => data?.rankSeries.filter((p) => p.score != null).length ?? 0,
    [data],
  );
  const peakPointCount = useMemo(() => data?.peakSeries?.length ?? 0, [data]);

  async function refresh() {
    setRefreshing(true);
    setMessage("");
    try {
      const id = data?.player.campId?.includes(":")
        ? data.player.campId.split(":")[0]
        : data?.player.campId;
      if (!id || !/^\d{5,15}$/.test(id)) {
        setMessage("缺少有效营地 ID，请从首页重新查询");
        setRefreshing(false);
        return;
      }
      const res = await apiFetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campId: id, forceRefresh: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(json.error || "刷新失败");
        setRefreshing(false);
        return;
      }
      setData(json.data);
      applyMatchPageMeta(json.data as DashData, 1);
      setMessage(
        json.data?.syncStatus?.status === "running"
          ? "正在后台同步战绩…"
          : "已是最新战绩",
      );
      if (json.data?.syncStatus?.status !== "running") {
        setRefreshing(false);
        await load();
      }
      // syncing 时由轮询结束再关 refreshing
    } catch {
      setMessage("网络错误");
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
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--line)] bg-black/25 px-2.5 py-1 text-sm">
            <span className="text-[var(--muted)]">营地 ID</span>
            <span className="font-medium tabular-nums tracking-wide text-[var(--text)]">
              {data.player.campId.includes(":")
                ? data.player.campId.split(":")[0]
                : data.player.campId}
            </span>
          </div>
          <h1 className="mt-2 flex flex-wrap items-center gap-3 text-2xl font-semibold text-[var(--gold-bright)]">
            <PlayerAvatar
              src={data.player.gameAvatarUrl}
              name={data.player.gameNickname}
              size={44}
            />
            <span className="min-w-0 break-words">{data.player.gameNickname}</span>
            <PlayerLikeButton
              nickname={data.player.gameNickname}
              initialCount={data.player.likeCount ?? 0}
            />
          </h1>
          {data.player.lastSyncAt ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              同步于 {new Date(data.player.lastSyncAt).toLocaleString()}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Link href="/" className="btn btn-ghost flex-1 sm:flex-none">
            查其他人
          </Link>
          <button className="btn btn-ghost flex-1 sm:flex-none" onClick={share}>
            分享
          </button>
          <button
            className="btn btn-primary flex-1 sm:flex-none"
            onClick={refresh}
            disabled={refreshing || syncing}
          >
            {refreshing || syncing ? "同步中…" : "刷新战绩"}
          </button>
        </div>
      </div>

      {syncing && (
        <div className="rounded-xl border border-[rgba(212,175,106,0.35)] bg-[rgba(212,175,106,0.08)] px-4 py-3 text-sm text-[var(--gold-bright)]">
          {data.syncStatus?.message || "正在同步战绩…"}
          {typeof data.syncStatus?.pulled === "number" && data.syncStatus.pulled > 0
            ? `（已拉取 ${data.syncStatus.pulled} 场）`
            : ""}
          <span className="ml-2 text-[var(--muted)]">页面会自动更新</span>
        </div>
      )}
      {message && !syncing && (
        <div className="rounded-xl border border-[var(--line)] bg-black/20 px-4 py-3 text-sm">
          {message}
        </div>
      )}
      {data.player.lastSyncError && data.syncStatus?.status !== "running" && (
        <div className="rounded-xl border border-[rgba(196,92,74,0.4)] bg-[rgba(196,92,74,0.1)] px-4 py-3 text-sm text-[#f0b4aa]">
          同步提示：{data.player.lastSyncError}
        </div>
      )}

      <OverviewBar data={data.player} />

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--gold-bright)]">段位变化</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {range === "7" ? "近 7 天" : range === "30" ? "近 30 天" : "全部"}
              · {rankPointCount} 场排位
            </p>
          </div>
          <select
            className="input !w-auto max-sm:w-full"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="7">近 7 天</option>
            <option value="30">近 30 天</option>
            <option value="all">全部</option>
          </select>
        </div>
        <RankChart key={`rank-${range}-${rankPointCount}`} data={data.rankSeries} />
      </section>

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[var(--gold-bright)]">巅峰分变化</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {range === "7" ? "近 7 天" : range === "30" ? "近 30 天" : "全部"}
              · {peakPointCount} 场巅峰
              {data.player.peakScore ? ` · 当前 ${data.player.peakScore}` : ""}
            </p>
          </div>
        </div>
        <ScoreTrendChart
          key={`peak-${range}-${peakPointCount}`}
          data={data.peakSeries || []}
          metric="peakScore"
          height={256}
        />
      </section>

      <section className="panel p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--gold-bright)]">英雄使用</h2>
          <select
            className="input !w-auto max-sm:w-full"
            value={heroSort}
            onChange={(e) => setHeroSort(e.target.value as typeof heroSort)}
          >
            <option value="games">按场次</option>
            <option value="winRate">按胜率</option>
            <option value="avgScore">按评分</option>
          </select>
        </div>
        <HeroGrid heroes={sortedHeroes} onSelect={selectHero} />
      </section>

      <section ref={matchesRef} className="panel scroll-mt-4 p-5 fade-in">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-[var(--gold-bright)]">
            近期对局{hero ? ` · ${hero}` : ""}
            {data.total > 0 ? (
              <span className="ml-2 text-sm font-normal text-[var(--muted)]">
                胜率 {data.matchWinRate ?? 0}%
                <span className="mx-1.5 text-[var(--line)]">·</span>
                负战绩占比{" "}
                {Math.round(
                  (((data.total - (data.wins ?? 0)) / data.total) * 1000),
                ) / 10}
                %
                <span className="mx-1.5 text-[var(--line)]">·</span>
                平均 KDA {data.matchAvgKda ?? 0}
                <span className="mx-1.5 text-[var(--line)]">·</span>
                平均评分 {data.matchAvgScore ?? 0}
              </span>
            ) : null}
          </h2>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <select
              className="input !w-auto max-sm:w-full"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="all">全部模式</option>
              <option value="ranked">排位</option>
              <option value="peak">巅峰</option>
              <option value="fun">娱乐</option>
            </select>
            <select
              className="input !w-auto max-sm:w-full"
              value={result}
              onChange={(e) => setResult(e.target.value)}
            >
              <option value="all">胜负</option>
              <option value="win">胜利</option>
              <option value="lose">失败</option>
            </select>
            <select
              className="input !w-auto max-sm:w-full"
              value={side}
              onChange={(e) => setSide(e.target.value)}
            >
              <option value="all">全部阵营</option>
              <option value="blue">蓝方</option>
              <option value="red">红方</option>
            </select>
            {hero && (
              <button className="btn btn-ghost !py-2 max-sm:col-span-2" onClick={clearHero}>
                清除英雄筛选
              </button>
            )}
          </div>
        </div>
        {data.matches.length === 0 && syncing ? (
          <p className="py-8 text-center text-sm text-[var(--muted)]">
            正在拉取对局列表，请稍候…
          </p>
        ) : (
          <MatchTable matches={data.matches} />
        )}
        {hasMoreMatches ? (
          <div ref={matchesSentinelRef} className="mt-3 py-2 text-center text-xs text-[var(--muted)]">
            {loadingMoreMatches ? "加载更多对局…" : "下滑加载更多"}
          </div>
        ) : null}
        <p className="mt-3 text-xs text-[var(--muted)]">
          {data.total > 0
            ? `已显示 ${data.matches.length} / ${data.total} 场`
            : "共 0 场"}
        </p>
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
