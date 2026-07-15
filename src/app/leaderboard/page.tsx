"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { formatRankLabel } from "@/lib/rank";
import { ScoreTrendChart, type TrendPoint } from "@/components/score-trend-chart";
import { RankChart } from "@/components/rank-chart";
import { withBasePath } from "@/lib/base-path";

type BoardType =
  | "score"
  | "rank"
  | "peak"
  | "power"
  | "winrate"
  | "avgscore"
  | "kda"
  | "hero"
  | "active";
type ScoreMode = "ranked" | "peak";
type HeroSortBy = "composite" | "winRate" | "games" | "avgKda" | "avgScore";
type WinRateSortBy = "winRate" | "wins";
type KdaSortBy = "kda" | "kills" | "deaths" | "assists";
type ChartMetric = "rankScore" | "peakRating" | "peakScore" | "combatPower" | "tierScore" | "winRate";

type Row = {
  rank: number;
  gameNickname: string;
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
  composite?: number;
  area?: string;
};

export default function LeaderboardPage() {
  const [type, setType] = useState<BoardType>("rank");
  const [scoreMode, setScoreMode] = useState<ScoreMode>("ranked");
  const [heroSortBy, setHeroSortBy] = useState<HeroSortBy>("composite");
  const [winRateSortBy, setWinRateSortBy] = useState<WinRateSortBy>("winRate");
  const [kdaSortBy, setKdaSortBy] = useState<KdaSortBy>("kda");
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

  useEffect(() => {
    fetch(withBasePath("/api/leaderboard"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "heroes" }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok && json.data.heroes?.length) {
          setHeroes(json.data.heroes.map((h: { name: string }) => h.name));
          setHero(json.data.heroes[0].name);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setExpanded(null);
    const qs = new URLSearchParams({ type, area, limit: "50" });
    if (type === "score") qs.set("scoreMode", scoreMode);
    if (type === "hero" || type === "power") qs.set("hero", hero);
    if (type === "hero") qs.set("sortBy", heroSortBy);
    if (type === "winrate") qs.set("sortBy", winRateSortBy);
    if (type === "kda") qs.set("sortBy", kdaSortBy);
    fetch(withBasePath(`/api/leaderboard?${qs}`))
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setRows(json.data.rows || []);
          if (
            (type === "winrate" || type === "avgscore" || type === "kda") &&
            json.data.minGames
          ) {
            setMinGames(json.data.minGames);
          }
        } else {
          setRows([]);
        }
      })
      .finally(() => setLoading(false));
  }, [type, scoreMode, area, hero, heroSortBy, winRateSortBy, kdaSortBy]);

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
      const json = await fetch(withBasePath(`/api/leaderboard?${qs}`)).then((r) => r.json());
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
          榜需至少 {minGames} 场；英雄榜按本地已同步对局统计，满 1 场即可上榜。
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
          >
            {(heroes.length ? heroes : ["李白", "韩信", "赵云"]).map((h) => (
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
      </div>

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

      <p className="text-xs text-[var(--muted)] sm:hidden">左右滑动表格查看更多列</p>
      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted)]">加载中…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)]">
            暂无数据，可先去{" "}
            <Link href="/" className="text-[var(--gold)]">
              查询玩家
            </Link>
            ，或在{" "}
            <Link href="/admin" className="text-[var(--gold)]">
              管理后台
            </Link>{" "}
            录入数据。
          </div>
        ) : (
          <table className="table">
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
                {type === "active" && <th>赛季场次(排位)</th>}
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
                          onClick={(e) => e.stopPropagation()}
                        >
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
                      {type === "active" && <td>{row.games}</td>}
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
      </div>
    </div>
  );
}
