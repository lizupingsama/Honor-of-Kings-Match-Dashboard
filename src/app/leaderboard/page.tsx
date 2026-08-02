"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { formatRankLabel } from "@/lib/rank";
import type { TrendPoint } from "@/components/score-trend-chart";
import { PlayerAvatar } from "@/components/player-avatar";
import { apiFetch } from "@/lib/client-fetch";
import { fmtK } from "@/lib/format";

// recharts 体积大且曲线要点击展开才显示，按需加载
const chartLoading = () => (
  <div className="flex h-full min-h-24 items-center justify-center text-xs text-zinc-500">
    图表加载中…
  </div>
);
const RankChart = dynamic(
  () => import("@/components/rank-chart").then((mod) => mod.RankChart),
  { ssr: false, loading: chartLoading },
);
const ScoreTrendChart = dynamic(
  () => import("@/components/score-trend-chart").then((mod) => mod.ScoreTrendChart),
  { ssr: false, loading: chartLoading },
);

type BoardType =
  | "score"
  | "rank"
  | "peak"
  | "power"
  | "winrate"
  | "avgscore"
  | "kda"
  | "contribution"
  | "medal"
  | "equipment"
  | "hero"
  | "active";
type ScoreMode = "ranked" | "peak";
type HeroSortBy = "composite" | "winRate" | "games" | "avgKda" | "avgScore";
type WinRateSortBy = "winRate" | "wins";
type KdaSortBy = "kda" | "kills" | "deaths" | "assists";
type ContributionSortBy = "damage" | "taken" | "join" | "economy";
type MedalSortBy = "total" | "top" | "gold" | "silver" | "bronze";
type EquipmentCategory = "all" | "magic" | "defense" | "physical";
type ChartMetric = "rankScore" | "peakRating" | "peakScore" | "combatPower" | "tierScore" | "winRate";

type LeaderboardViewState = {
  type: BoardType;
  scoreMode: ScoreMode;
  heroSortBy: HeroSortBy;
  winRateSortBy: WinRateSortBy;
  kdaSortBy: KdaSortBy;
  contributionSortBy: ContributionSortBy;
  medalSortBy: MedalSortBy;
  equipmentCategory: EquipmentCategory;
  showExtraBoards: boolean;
  area: string;
  hero: string;
};

const LEADERBOARD_VIEW_KEY = "wzry:leaderboard:view";
const LEADERBOARD_SCROLL_KEY = "wzry:leaderboard:scrollY";

function readStoredLeaderboardView(): Partial<LeaderboardViewState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(LEADERBOARD_VIEW_KEY);
    return raw ? (JSON.parse(raw) as Partial<LeaderboardViewState>) : null;
  } catch {
    return null;
  }
}

function readStoredLeaderboardScroll() {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(LEADERBOARD_SCROLL_KEY);
  const y = raw == null ? Number.NaN : Number(raw);
  return Number.isFinite(y) ? y : null;
}

type Row = {
  rank: number;
  gameNickname: string;
  gameAvatarUrl?: string | null;
  currentRank?: string | null;
  currentStars?: number;
  rankScore?: number;
  peakRating?: number;
  peakScore?: number;
  combatPower?: number;
  avgScore?: number;
  heroName?: string;
  winRate?: number;
  seasonGames?: number;
  seasonWins?: number;
  games?: number;
  avgKda?: number;
  avgKills?: number;
  avgDeaths?: number;
  avgAssists?: number;
  avgEconomyPerMin?: number;
  avgDamage?: number;
  avgTakenDamage?: number;
  avgJoinPct?: number;
  composite?: number;
  topMedals?: number;
  goldMedals?: number;
  silverMedals?: number;
  bronzeMedals?: number;
  totalMedals?: number;
  equipId?: number;
  equipName?: string;
  equipIcon?: string | null;
  categoryLabel?: string;
  appearances?: number;
  appearanceRate?: number;
  wins?: number;
  area?: string;
};

export default function LeaderboardPage() {
  const [viewReady, setViewReady] = useState(false);
  const [type, setType] = useState<BoardType>("rank");
  const [scoreMode, setScoreMode] = useState<ScoreMode>("ranked");
  const [heroSortBy, setHeroSortBy] = useState<HeroSortBy>("composite");
  const [winRateSortBy, setWinRateSortBy] = useState<WinRateSortBy>("winRate");
  const [kdaSortBy, setKdaSortBy] = useState<KdaSortBy>("kda");
  const [contributionSortBy, setContributionSortBy] =
    useState<ContributionSortBy>("damage");
  const [medalSortBy, setMedalSortBy] = useState<MedalSortBy>("total");
  const [equipmentCategory, setEquipmentCategory] = useState<EquipmentCategory>("all");
  const [showExtraBoards, setShowExtraBoards] = useState(false);
  const [area, setArea] = useState("all");
  const [hero, setHero] = useState("李白");
  const [heroes, setHeroes] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [minGames, setMinGames] = useState(10); // 胜率榜门槛
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [seriesMap, setSeriesMap] = useState<Record<string, TrendPoint[]>>({});
  const [rankSeriesMap, setRankSeriesMap] = useState<
    Record<
      string,
      Array<{
        t: string;
        score: number | null;
        label?: string | null;
        stars?: number | null;
        result?: string;
        hero?: string;
      }>
    >
  >({});
  const [seriesLoading, setSeriesLoading] = useState<string | null>(null);
  const pendingScrollRestoreRef = useRef<number | null>(null);

  function rememberLeaderboardPosition() {
    window.sessionStorage.setItem(LEADERBOARD_SCROLL_KEY, String(window.scrollY));
  }

  useEffect(() => {
    const storedView = readStoredLeaderboardView();
    const storedScroll = readStoredLeaderboardScroll();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (storedView) {
        if (storedView.type) setType(storedView.type);
        if (storedView.scoreMode) setScoreMode(storedView.scoreMode);
        if (storedView.heroSortBy) setHeroSortBy(storedView.heroSortBy);
        if (storedView.winRateSortBy) setWinRateSortBy(storedView.winRateSortBy);
        if (storedView.kdaSortBy) setKdaSortBy(storedView.kdaSortBy);
        if (storedView.contributionSortBy) {
          setContributionSortBy(storedView.contributionSortBy);
        }
        if (storedView.medalSortBy) setMedalSortBy(storedView.medalSortBy);
        if (storedView.equipmentCategory) {
          setEquipmentCategory(storedView.equipmentCategory);
        }
        if (typeof storedView.showExtraBoards === "boolean") {
          setShowExtraBoards(storedView.showExtraBoards);
        }
        if (storedView.area) setArea(storedView.area);
        if (storedView.hero) setHero(storedView.hero);
      }
      pendingScrollRestoreRef.current = storedScroll;
      setViewReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    const forPower = type === "power";
    apiFetch("/api/leaderboard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heroes", forPower }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data.heroes?.length) {
          const names = json.data.heroes.map((h: { name: string }) => h.name);
          setHeroes(names);
          setHero((prev) => (names.includes(prev) ? prev : names[0]));
        } else if (forPower) {
          setHeroes([]);
        }
      })
      .catch(() => {});
  }, [type, viewReady]);

  useEffect(() => {
    if (!viewReady) return;
    queueMicrotask(() => {
      setLoading(true);
      setExpanded(null);
    });
    const qs = new URLSearchParams({ type, area, limit: "50" });
    if (type === "score") qs.set("scoreMode", scoreMode);
    if (type === "hero" || type === "power") qs.set("hero", hero);
    if (type === "hero") qs.set("sortBy", heroSortBy);
    if (type === "winrate") qs.set("sortBy", winRateSortBy);
    if (type === "kda") qs.set("sortBy", kdaSortBy);
    if (type === "contribution") qs.set("sortBy", contributionSortBy);
    if (type === "medal") qs.set("sortBy", medalSortBy);
    if (type === "equipment") qs.set("category", equipmentCategory);
    apiFetch(`/api/leaderboard?${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setRows(json.data.rows || []);
          if (
            (type === "winrate" ||
              type === "avgscore" ||
              type === "kda" ||
              type === "contribution") &&
            json.data.minGames
          ) {
            setMinGames(json.data.minGames);
          }
        } else {
          setRows([]);
        }
      })
      .finally(() => setLoading(false));
  }, [
    type,
    scoreMode,
    area,
    hero,
    heroSortBy,
    winRateSortBy,
    kdaSortBy,
    contributionSortBy,
    medalSortBy,
    equipmentCategory,
    viewReady,
  ]);

  useEffect(() => {
    if (!viewReady) return;
    window.sessionStorage.setItem(
      LEADERBOARD_VIEW_KEY,
      JSON.stringify({
        type,
        scoreMode,
        heroSortBy,
        winRateSortBy,
        kdaSortBy,
        contributionSortBy,
        medalSortBy,
        equipmentCategory,
        showExtraBoards,
        area,
        hero,
      } satisfies LeaderboardViewState),
    );
  }, [
    type,
    scoreMode,
    heroSortBy,
    winRateSortBy,
    kdaSortBy,
    contributionSortBy,
    medalSortBy,
    equipmentCategory,
    showExtraBoards,
    area,
    hero,
    viewReady,
  ]);

  useEffect(() => {
    const y = pendingScrollRestoreRef.current;
    if (!viewReady || loading || y == null) return;
    pendingScrollRestoreRef.current = null;
    window.sessionStorage.removeItem(LEADERBOARD_SCROLL_KEY);
    requestAnimationFrame(() => window.scrollTo({ top: y }));
  }, [viewReady, loading, rows.length]);

  function activeMetric(): ChartMetric | null {
    if (type === "score") return scoreMode === "ranked" ? "rankScore" : "peakRating";
    if (type === "rank") return "tierScore";
    if (type === "peak") return "peakScore";
    if (type === "power") return "combatPower";
    if (type === "winrate") return "winRate";
    return null;
  }

  function chartTitle() {
    if (type === "score") {
      return scoreMode === "ranked" ? "排位评分曲线" : "巅峰评分曲线";
    }
    if (type === "rank") return "段位曲线";
    if (type === "peak") return "巅峰分曲线";
    if (type === "power") return `${hero} · 英雄战力曲线`;
    if (type === "winrate") return "胜率曲线";
    return "曲线";
  }

  function cacheKeyFor(nickname: string, metric: ChartMetric) {
    if (metric === "combatPower") return `${nickname}:${metric}:${hero}`;
    if (type === "score") return `${nickname}:${metric}:score`;
    return `${nickname}:${metric}`;
  }

  async function toggleExpand(nickname: string) {
    const metric = activeMetric();
    if (!metric) return;

    if (expanded === nickname) {
      setExpanded(null);
      return;
    }
    setExpanded(nickname);

    const cacheKey = cacheKeyFor(nickname, metric);
    if (metric === "tierScore") {
      if (rankSeriesMap[cacheKey]) return;
    } else if (seriesMap[cacheKey]) {
      return;
    }

    setSeriesLoading(cacheKey);
    try {
      const qs = new URLSearchParams({
        type: "series",
        nickname,
        metric,
      });
      if (metric === "combatPower") qs.set("hero", hero);
      const json = await apiFetch(`/api/leaderboard?${qs}`).then((r) => r.json());
      if (json.ok) {
        const series = json.data.series || [];
        if (metric === "tierScore") {
          setRankSeriesMap((prev) => ({
            ...prev,
            [cacheKey]: series.map(
              (p: {
                t: string;
                value?: number;
                score?: number;
                label?: string | null;
                stars?: number | null;
                result?: string;
                hero?: string;
              }) => ({
                t: p.t,
                score: p.score ?? p.value ?? null,
                label: p.label,
                stars: p.stars,
                result: p.result,
                hero: p.hero,
              }),
            ),
          }));
        } else {
          setSeriesMap((prev) => ({ ...prev, [cacheKey]: series }));
        }
      }
    } finally {
      setSeriesLoading(null);
    }
  }

  const expandable =
    type === "score" ||
    type === "rank" ||
    type === "peak" ||
    type === "power" ||
    type === "winrate";
  const needHero = type === "hero" || type === "power";

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--gold-bright)]">站内排行榜</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          排位（段位星数）、巅峰（巅峰分数）相互独立。胜率榜 / 均分榜 / KDA
          榜 / 贡献榜需至少 {minGames} 场；奖牌榜按本地已同步对局统计，有奖牌即可上榜；英雄榜按本地已同步对局统计，满 1
          场即可上榜。装备榜只统计最终合成的大装备，出场率按有出装数据的对局数计算。
          英雄战力榜来自对局详情中的战力，同步详情后可上榜并查看曲线。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["rank", "排位"],
            ["peak", "巅峰"],
            ["winrate", "胜率榜"],
            ["avgscore", "均分榜"],
            ["kda", "KDA榜"],
            ["contribution", "贡献榜"],
            ["medal", "奖牌榜"],
            ["equipment", "装备榜"],
            ["hero", "英雄榜"],
            ["active", "活跃榜"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`btn ${type === key ? "btn-primary" : "btn-ghost"} !py-2`}
            onClick={() => setType(key)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={`btn ${
            showExtraBoards || type === "score" || type === "power"
              ? "btn-primary"
              : "btn-ghost"
          } !py-2`}
          onClick={() => {
            setShowExtraBoards((v) => {
              const next = !v;
              if (!next && (type === "score" || type === "power")) {
                setType("rank");
              }
              return next;
            });
          }}
          aria-expanded={showExtraBoards || type === "score" || type === "power"}
        >
          {showExtraBoards || type === "score" || type === "power"
            ? "收起更多"
            : "更多"}
        </button>
        {(showExtraBoards || type === "score" || type === "power") &&
          (
            [
              ["score", "评分"],
              ["power", "英雄战力"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`btn ${type === key ? "btn-primary" : "btn-ghost"} !py-2`}
              onClick={() => setType(key)}
            >
              {label}
            </button>
          ))}
        <select
          className="input !w-auto max-sm:flex-1"
          value={area}
          onChange={(e) => setArea(e.target.value)}
        >
          <option value="all">全部区服</option>
          <option value="wechat">微信区</option>
          <option value="qq">QQ 区</option>
        </select>
        {needHero && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={hero}
            onChange={(e) => setHero(e.target.value)}
            disabled={type === "power" && heroes.length === 0}
          >
            {(heroes.length
              ? heroes
              : type === "power"
                ? ["（暂无战力数据）"]
                : ["李白", "韩信", "赵云"]
            ).map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        )}
        {type === "hero" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={heroSortBy}
            onChange={(e) => setHeroSortBy(e.target.value as HeroSortBy)}
            title="英雄榜排序"
          >
            <option value="composite">综合</option>
            <option value="winRate">胜率</option>
            <option value="games">场次</option>
            <option value="avgKda">KDA</option>
            <option value="avgScore">评分</option>
          </select>
        )}
        {type === "winrate" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={winRateSortBy}
            onChange={(e) => setWinRateSortBy(e.target.value as WinRateSortBy)}
            title="胜率榜排序"
          >
            <option value="winRate">胜率</option>
            <option value="wins">胜场</option>
          </select>
        )}
        {type === "kda" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={kdaSortBy}
            onChange={(e) => setKdaSortBy(e.target.value as KdaSortBy)}
            title="KDA榜排序"
          >
            <option value="kda">KDA</option>
            <option value="kills">击杀</option>
            <option value="deaths">死亡</option>
            <option value="assists">助攻</option>
          </select>
        )}
        {type === "contribution" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={contributionSortBy}
            onChange={(e) =>
              setContributionSortBy(e.target.value as ContributionSortBy)
            }
            title="贡献榜排序"
          >
            <option value="damage">场均输出</option>
            <option value="taken">场均承伤</option>
            <option value="join">场均参团</option>
            <option value="economy">分均经济</option>
          </select>
        )}
        {type === "medal" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={medalSortBy}
            onChange={(e) => setMedalSortBy(e.target.value as MedalSortBy)}
            title="奖牌榜排序"
          >
            <option value="total">总奖牌</option>
            <option value="top">顶级</option>
            <option value="gold">金牌</option>
            <option value="silver">银牌</option>
            <option value="bronze">铜牌</option>
          </select>
        )}
        {type === "equipment" && (
          <select
            className="input !w-auto max-sm:flex-1"
            value={equipmentCategory}
            onChange={(e) => setEquipmentCategory(e.target.value as EquipmentCategory)}
            title="装备分类"
          >
            <option value="all">总榜</option>
            <option value="magic">法装</option>
            <option value="defense">防装</option>
            <option value="physical">物攻装</option>
          </select>
        )}
      </div>

      {type === "medal" && (
        <p className="text-xs text-[var(--muted)]">
          奖牌榜按本地已同步对局中的奖牌文案统计，总奖牌 = 顶级 + 金牌 + 银牌
          + 铜牌。
        </p>
      )}

      {type === "equipment" && (
        <p className="text-xs text-[var(--muted)]">
          装备榜解析每场最终出装，同一场同一装备只计 1 次；铁剑、大棒、陨星等中间件不会计入。
          总榜包含鞋子、打野装和辅助装，分类榜只展示法装 / 防装 / 物攻装。
        </p>
      )}

      {type === "hero" && (
        <p className="text-xs text-[var(--muted)]">
          综合分 =（胜率×45% + KDA折算×30% + 评分折算×25%）× 场次可信度；KDA 按 10
          封顶、评分按 12 封顶折算，场次越多可信度越高（10 场封顶）。
        </p>
      )}

      {type === "score" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--muted)]">模式</span>
          <div className="inline-flex rounded-full border border-[var(--line)] p-0.5">
            <button
              className={`btn !rounded-full !px-4 !py-1.5 text-sm ${
                scoreMode === "ranked" ? "btn-primary" : "btn-ghost !border-0"
              }`}
              onClick={() => setScoreMode("ranked")}
            >
              排位评分
            </button>
            <button
              className={`btn !rounded-full !px-4 !py-1.5 text-sm ${
                scoreMode === "peak" ? "btn-primary" : "btn-ghost !border-0"
              }`}
              onClick={() => setScoreMode("peak")}
            >
              巅峰评分
            </button>
          </div>
        </div>
      )}

      <div className="panel overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted)]">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)]">
            {type === "power" ? (
              <>
                暂无该英雄的战力数据。请先去{" "}
                <Link href="/" className="text-[var(--gold)]">
                  查询并同步玩家
                </Link>
                （需补全对局详情），同步完成后会出现在战力榜，点击行可查看战力曲线。
              </>
            ) : (
              <>
                暂无数据，可先去{" "}
                <Link href="/" className="text-[var(--gold)]">
                  查询玩家
                </Link>
                ，或在{" "}
                <Link href="/admin" className="text-[var(--gold)]">
                  管理后台
                </Link>{" "}
                录入数据。
              </>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 p-3 sm:hidden">
              {rows.map((row) => {
                const isOpen = expanded === row.gameNickname;
                const metric = activeMetric();
                const cacheKey = metric ? cacheKeyFor(row.gameNickname, metric) : "";
                const scoreValue =
                  scoreMode === "ranked" ? (row.rankScore ?? 0) : (row.peakRating ?? 0);
                const detailItems: Array<[string, ReactNode]> = [
                  [
                    "区服",
                    row.area === "qq" ? "QQ" : row.area === "wechat" ? "微信" : "-",
                  ],
                ];

                if (type === "score") detailItems.push(["评分", scoreValue]);
                if (type === "rank") {
                  detailItems.push([
                    "段位星数",
                    formatRankLabel(row.currentRank, row.currentStars ?? 0),
                  ]);
                }
                if (type === "peak") detailItems.push(["巅峰分数", row.peakScore ?? 0]);
                if (type === "power") {
                  detailItems.push(["英雄战力", row.combatPower ?? 0], ["场次", row.games ?? 0]);
                }
                if (type === "winrate" || type === "hero") {
                  detailItems.push(["胜率", `${row.winRate}%`]);
                }
                if (type === "hero") {
                  detailItems.push(
                    ["场次", row.games],
                    ["KDA", row.avgKda],
                    ["评分", row.avgScore],
                    ["综合", row.composite ?? 0],
                  );
                }
                if (type === "winrate") {
                  detailItems.push(["胜场", row.seasonWins ?? 0], ["场次", row.seasonGames]);
                }
                if (type === "avgscore") {
                  detailItems.push(["平均评分", row.avgScore ?? 0], ["近期场次", row.games ?? 0]);
                }
                if (type === "kda") {
                  detailItems.push(
                    ["KDA", row.avgKda ?? 0],
                    ["场均击杀", row.avgKills ?? 0],
                    ["场均死亡", row.avgDeaths ?? 0],
                    ["场均助攻", row.avgAssists ?? 0],
                    ["近期场次", row.games ?? 0],
                  );
                }
                if (type === "contribution") {
                  detailItems.push(
                    ["分均经济", row.avgEconomyPerMin ?? 0],
                    ["场均输出", fmtK(row.avgDamage ?? 0)],
                    ["场均承伤", fmtK(row.avgTakenDamage ?? 0)],
                    ["场均参团", `${row.avgJoinPct ?? 0}%`],
                    ["近期场次", row.games ?? 0],
                  );
                }
                if (type === "active") detailItems.push(["赛季场次(排位)", row.games]);
                if (type === "medal") {
                  detailItems.push(
                    ["总奖牌", row.totalMedals ?? 0],
                    [
                      "顶级",
                      <span key="t" className="chip chip-medal-top">
                        {row.topMedals ?? 0}
                      </span>,
                    ],
                    [
                      "金牌",
                      <span key="g" className="chip chip-medal-gold">
                        {row.goldMedals ?? 0}
                      </span>,
                    ],
                    [
                      "银牌",
                      <span key="s" className="chip chip-medal-silver">
                        {row.silverMedals ?? 0}
                      </span>,
                    ],
                    [
                      "铜牌",
                      <span key="b" className="chip chip-medal-bronze">
                        {row.bronzeMedals ?? 0}
                      </span>,
                    ],
                  );
                }
                if (type === "equipment") {
                  return (
                    <div
                      key={`mobile-equipment-${row.rank}-${row.equipName}`}
                      className="rounded-2xl border border-[var(--line)] bg-black/15 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          {row.equipIcon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.equipIcon}
                              alt={row.equipName || "装备"}
                              className="h-11 w-11 shrink-0 rounded-lg border border-[var(--line)] bg-black/30 object-cover"
                            />
                          ) : (
                            <div className="h-11 w-11 shrink-0 rounded-lg border border-[var(--line)] bg-black/30" />
                          )}
                          <div className="min-w-0">
                            <div className="text-sm text-[var(--gold)]">#{row.rank}</div>
                            <div className="truncate text-lg font-semibold text-[var(--gold-bright)]">
                              {row.equipName}
                            </div>
                            <div className="mt-1 text-xs text-[var(--muted)]">
                              {row.categoryLabel}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        {[
                          ["出场次数", row.appearances ?? 0],
                          ["出场率", `${row.appearanceRate ?? 0}%`],
                          ["胜场", row.wins ?? 0],
                          ["胜率", `${row.winRate ?? 0}%`],
                        ].map(([label, value]) => (
                          <div key={label} className="min-w-0 rounded-xl bg-black/20 p-3">
                            <div className="text-xs text-[var(--muted)]">{label}</div>
                            <div className="mt-1 break-words font-medium text-[var(--text)]">
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={`mobile-${row.rank}-${row.gameNickname}`}
                    className="rounded-2xl border border-[var(--line)] bg-black/15 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-[var(--gold)]">#{row.rank}</div>
                        <Link
                          href={`/p/${encodeURIComponent(row.gameNickname)}`}
                          className="group mt-1 inline-flex min-w-0 flex-wrap items-center gap-2 text-[var(--gold-bright)]"
                          aria-label={`进入 ${row.gameNickname} 的主页`}
                          onClick={rememberLeaderboardPosition}
                        >
                          <PlayerAvatar
                            src={row.gameAvatarUrl}
                            name={row.gameNickname}
                            size={28}
                          />
                          <span className="break-words text-lg font-semibold">
                            {row.gameNickname}
                          </span>
                          <span className="rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--muted)] transition group-hover:border-[var(--gold)] group-hover:text-[var(--gold-bright)]">
                            主页 ↗
                          </span>
                        </Link>
                      </div>
                      {expandable && (
                        <button
                          type="button"
                          className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs"
                          onClick={() => toggleExpand(row.gameNickname)}
                        >
                          {isOpen ? "收起曲线" : "查看曲线"}
                        </button>
                      )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      {detailItems.map(([label, value]) => (
                        <div key={label} className="min-w-0 rounded-xl bg-black/20 p-3">
                          <div className="text-xs text-[var(--muted)]">{label}</div>
                          <div className="mt-1 break-words font-medium text-[var(--text)]">
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>

                    {expandable && isOpen && metric && (
                      <div className="mt-4 border-t border-white/10 pt-4">
                        <div className="mb-2 text-sm text-[var(--muted)]">
                          {row.gameNickname} · {chartTitle()}
                        </div>
                        {seriesLoading === cacheKey ? (
                          <div className="py-10 text-center text-sm text-[var(--muted)]">
                            加载曲线…
                          </div>
                        ) : type === "rank" ? (
                          <RankChart data={rankSeriesMap[cacheKey] || []} />
                        ) : (
                          <ScoreTrendChart
                            data={seriesMap[cacheKey] || []}
                            metric={metric === "tierScore" ? "rankScore" : metric}
                            yAsRankLabel={false}
                            yDomain={
                              type === "score" ? [0, 110] : type === "winrate" ? [0, 100] : undefined
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {type === "equipment" ? (
              <table className="table max-sm:hidden">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>装备</th>
                    <th>分类</th>
                    <th>出场次数</th>
                    <th>出场率</th>
                    <th>胜场</th>
                    <th>胜率</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`equipment-${row.rank}-${row.equipName}`}>
                      <td className="text-[var(--gold)]">{row.rank}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          {row.equipIcon ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={row.equipIcon}
                              alt={row.equipName || "装备"}
                              className="h-8 w-8 shrink-0 rounded-lg border border-[var(--line)] bg-black/30 object-cover"
                            />
                          ) : (
                            <div className="h-8 w-8 shrink-0 rounded-lg border border-[var(--line)] bg-black/30" />
                          )}
                          <span className="font-medium text-[var(--gold-bright)]">
                            {row.equipName}
                          </span>
                        </div>
                      </td>
                      <td className="text-[var(--muted)]">{row.categoryLabel}</td>
                      <td>{row.appearances ?? 0}</td>
                      <td className="font-medium text-[var(--gold-bright)]">
                        {row.appearanceRate ?? 0}%
                      </td>
                      <td>{row.wins ?? 0}</td>
                      <td>{row.winRate ?? 0}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
            <table className="table max-sm:hidden">
            <thead>
              <tr>
                <th>#</th>
                <th>王者名称</th>
                <th>区服</th>
                {type === "score" && <th>评分</th>}
                {type === "rank" && <th>段位星数</th>}
                {type === "peak" && <th>巅峰分数</th>}
                {type === "power" && (
                  <>
                    <th>英雄战力</th>
                    <th>场次</th>
                  </>
                )}
                {(type === "winrate" || type === "hero") && <th>胜率</th>}
                {type === "hero" && (
                  <>
                    <th>场次</th>
                    <th>KDA</th>
                    <th>评分</th>
                    <th>综合</th>
                  </>
                )}
                {type === "winrate" && (
                  <>
                    <th>胜场</th>
                    <th>场次</th>
                  </>
                )}
                {type === "avgscore" && (
                  <>
                    <th>平均评分</th>
                    <th>近期场次</th>
                  </>
                )}
                {type === "kda" && (
                  <>
                    <th>KDA</th>
                    <th>场均击杀</th>
                    <th>场均死亡</th>
                    <th>场均助攻</th>
                    <th>近期场次</th>
                  </>
                )}
                {type === "contribution" && (
                  <>
                    <th>分均经济</th>
                    <th>场均输出</th>
                    <th>场均承伤</th>
                    <th>场均参团</th>
                    <th>近期场次</th>
                  </>
                )}
                {type === "active" && <th>赛季场次(排位)</th>}
                {type === "medal" && (
                  <>
                    <th>总奖牌</th>
                    <th>顶级</th>
                    <th>金牌</th>
                    <th>银牌</th>
                    <th>铜牌</th>
                  </>
                )}
                {expandable && <th className="w-16"></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isOpen = expanded === row.gameNickname;
                const metric = activeMetric();
                const cacheKey = metric ? cacheKeyFor(row.gameNickname, metric) : "";
                const scoreValue =
                  scoreMode === "ranked" ? (row.rankScore ?? 0) : (row.peakRating ?? 0);
                return (
                  <Fragment key={`${row.rank}-${row.gameNickname}`}>
                    <tr
                      className={
                        expandable ? "cursor-pointer hover:bg-white/[0.03]" : undefined
                      }
                      onClick={() => {
                        if (expandable) toggleExpand(row.gameNickname);
                      }}
                    >
                      <td className="text-[var(--gold)]">{row.rank}</td>
                      <td>
                        <Link
                          href={`/p/${encodeURIComponent(row.gameNickname)}`}
                          className="group inline-flex min-w-0 items-center gap-2 hover:text-[var(--gold-bright)]"
                          aria-label={`进入 ${row.gameNickname} 的主页`}
                          onClick={(e) => {
                            e.stopPropagation();
                            rememberLeaderboardPosition();
                          }}
                        >
                          <PlayerAvatar
                            src={row.gameAvatarUrl}
                            name={row.gameNickname}
                            size={28}
                          />
                          <span className="max-w-32 truncate font-medium underline decoration-[var(--line)] decoration-dotted underline-offset-4 group-hover:decoration-[var(--gold-bright)] sm:max-w-none">
                            {row.gameNickname}
                          </span>
                          <span className="rounded-full border border-[var(--line)] px-1.5 py-0.5 text-[10px] leading-none text-[var(--muted)] transition group-hover:border-[var(--gold)] group-hover:text-[var(--gold-bright)]">
                            主页 ↗
                          </span>
                        </Link>
                      </td>
                      <td className="text-[var(--muted)]">
                        {row.area === "qq" ? "QQ" : row.area === "wechat" ? "微信" : "-"}
                      </td>
                      {type === "score" && (
                        <td className="font-medium text-[var(--gold-bright)]">{scoreValue}</td>
                      )}
                      {type === "rank" && (
                        <td>{formatRankLabel(row.currentRank, row.currentStars ?? 0)}</td>
                      )}
                      {type === "peak" && (
                        <td className="font-medium text-[var(--gold-bright)]">
                          {row.peakScore ?? 0}
                        </td>
                      )}
                      {type === "power" && (
                        <>
                          <td className="font-medium text-[var(--gold-bright)]">
                            {row.combatPower ?? 0}
                          </td>
                          <td>{row.games ?? 0}</td>
                        </>
                      )}
                      {(type === "winrate" || type === "hero") && <td>{row.winRate}%</td>}
                      {type === "hero" && (
                        <>
                          <td>{row.games}</td>
                          <td>{row.avgKda}</td>
                          <td>{row.avgScore}</td>
                          <td className="font-medium text-[var(--gold-bright)]">
                            {row.composite ?? 0}
                          </td>
                        </>
                      )}
                      {type === "winrate" && (
                        <>
                          <td>{row.seasonWins ?? 0}</td>
                          <td>{row.seasonGames}</td>
                        </>
                      )}
                      {type === "avgscore" && (
                        <>
                          <td className="font-medium text-[var(--gold-bright)]">
                            {row.avgScore ?? 0}
                          </td>
                          <td>{row.games ?? 0}</td>
                        </>
                      )}
                      {type === "kda" && (
                        <>
                          <td className="font-medium text-[var(--gold-bright)]">
                            {row.avgKda ?? 0}
                          </td>
                          <td>{row.avgKills ?? 0}</td>
                          <td>{row.avgDeaths ?? 0}</td>
                          <td>{row.avgAssists ?? 0}</td>
                          <td>{row.games ?? 0}</td>
                        </>
                      )}
                      {type === "contribution" && (
                        <>
                          <td
                            className={
                              contributionSortBy === "economy"
                                ? "font-medium text-[var(--gold-bright)]"
                                : undefined
                            }
                          >
                            {row.avgEconomyPerMin ?? 0}
                          </td>
                          <td
                            className={
                              contributionSortBy === "damage"
                                ? "font-medium text-[var(--gold-bright)]"
                                : undefined
                            }
                          >
                            {fmtK(row.avgDamage ?? 0)}
                          </td>
                          <td
                            className={
                              contributionSortBy === "taken"
                                ? "font-medium text-[var(--gold-bright)]"
                                : undefined
                            }
                          >
                            {fmtK(row.avgTakenDamage ?? 0)}
                          </td>
                          <td
                            className={
                              contributionSortBy === "join"
                                ? "font-medium text-[var(--gold-bright)]"
                                : undefined
                            }
                          >
                            {row.avgJoinPct ?? 0}%
                          </td>
                          <td>{row.games ?? 0}</td>
                        </>
                      )}
                      {type === "active" && <td>{row.games}</td>}
                      {type === "medal" && (
                        <>
                          <td
                            className={
                              medalSortBy === "total"
                                ? "font-medium text-[var(--gold-bright)]"
                                : undefined
                            }
                          >
                            {row.totalMedals ?? 0}
                          </td>
                          <td>
                            <span
                              className={`chip chip-medal-top${
                                medalSortBy === "top" ? " font-semibold" : ""
                              }`}
                            >
                              {row.topMedals ?? 0}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`chip chip-medal-gold${
                                medalSortBy === "gold" ? " font-semibold" : ""
                              }`}
                            >
                              {row.goldMedals ?? 0}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`chip chip-medal-silver${
                                medalSortBy === "silver" ? " font-semibold" : ""
                              }`}
                            >
                              {row.silverMedals ?? 0}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`chip chip-medal-bronze${
                                medalSortBy === "bronze" ? " font-semibold" : ""
                              }`}
                            >
                              {row.bronzeMedals ?? 0}
                            </span>
                          </td>
                        </>
                      )}
                      {expandable && (
                        <td className="text-[var(--muted)]">{isOpen ? "收起" : "曲线"}</td>
                      )}
                    </tr>
                    {expandable && isOpen && metric && (
                      <tr className="bg-black/20">
                        <td colSpan={8} className="!py-4">
                          <div className="min-w-0 px-2">
                            <div className="mb-2 text-sm text-[var(--muted)]">
                              {row.gameNickname} · {chartTitle()}
                            </div>
                            {seriesLoading === cacheKey ? (
                              <div className="py-10 text-center text-sm text-[var(--muted)]">
                                加载曲线…
                              </div>
                            ) : type === "rank" ? (
                              <RankChart data={rankSeriesMap[cacheKey] || []} />
                            ) : (
                              <ScoreTrendChart
                                data={seriesMap[cacheKey] || []}
                                metric={metric === "tierScore" ? "rankScore" : metric}
                                yAsRankLabel={false}
                                yDomain={
                                  type === "score"
                                    ? [0, 110]
                                    : type === "winrate"
                                      ? [0, 100]
                                      : undefined
                                }
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
