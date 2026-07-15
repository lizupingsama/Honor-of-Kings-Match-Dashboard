import {
  getRankLeaderboard,
  getRankRatingLeaderboard,
  getPeakRatingLeaderboard,
  getPeakLeaderboard,
  getPowerLeaderboard,
  getWinRateLeaderboard,
  getAvgScoreLeaderboard,
  getKdaLeaderboard,
  getHeroLeaderboard,
  getActiveLeaderboard,
  getMinGames,
  type HeroSortBy,
  type WinRateSortBy,
  type KdaSortBy,
} from "@/lib/leaderboard";
import {
  getPlayerScoreSeries,
  getTierScoreSeries,
  getPeakMatchSeries,
  getHeroPowerSeries,
  type ScoreMetric,
} from "@/lib/score-history";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "score";
    const area = searchParams.get("area") || "all";
    const heroName = searchParams.get("hero") || "";
    const limit = Math.min(100, Number(searchParams.get("limit") || "50"));
    const offset = Math.max(0, Number(searchParams.get("offset") || "0"));
    const nickname = searchParams.get("nickname") || "";
    const metric = (searchParams.get("metric") || "rankScore") as
      | ScoreMetric
      | "combatPower"
      | "tierScore";
    const scoreMode = (searchParams.get("scoreMode") || "ranked") as "ranked" | "peak";

    if (type === "series") {
      if (!nickname) return jsonError("请指定玩家", 400);
      if (metric === "combatPower") {
        if (!heroName) return jsonError("请指定英雄", 400);
        const series = await getHeroPowerSeries(nickname, heroName);
        return jsonOk({ nickname, metric, heroName, series });
      }
      if (metric === "tierScore") {
        const series = await getTierScoreSeries(nickname);
        return jsonOk({ nickname, metric, series });
      }
      if (metric === "peakScore") {
        const series = await getPeakMatchSeries(nickname);
        return jsonOk({ nickname, metric, series });
      }
      if (!["rankScore", "peakRating", "winRate"].includes(metric)) {
        return jsonError("未知指标", 400);
      }
      const series = await getPlayerScoreSeries(nickname, metric as ScoreMetric);
      return jsonOk({ nickname, metric, series });
    }

    if (type === "score") {
      if (scoreMode === "peak") {
        const rows = await getPeakRatingLeaderboard({ area, limit, offset });
        return jsonOk({ type, scoreMode: "peak", rows });
      }
      const rows = await getRankRatingLeaderboard({ area, limit, offset });
      return jsonOk({ type, scoreMode: "ranked", rows });
    }
    if (type === "rank") {
      const rows = await getRankLeaderboard({ area, limit, offset });
      return jsonOk({ type, rows });
    }
    if (type === "peak") {
      const rows = await getPeakLeaderboard({ area, limit, offset });
      return jsonOk({ type, rows });
    }
    if (type === "power") {
      if (!heroName) return jsonError("请指定英雄名称", 400);
      const rows = await getPowerLeaderboard({ heroName, area, limit, offset });
      return jsonOk({ type, rows, heroName });
    }
    if (type === "winrate") {
      const sortRaw = searchParams.get("sortBy") || "winRate";
      const allowed: WinRateSortBy[] = ["winRate", "wins"];
      const sortBy = (allowed.includes(sortRaw as WinRateSortBy)
        ? sortRaw
        : "winRate") as WinRateSortBy;
      const rows = await getWinRateLeaderboard({ area, limit, offset, sortBy });
      return jsonOk({ type, rows, minGames: getMinGames(), sortBy });
    }
    if (type === "avgscore") {
      const rows = await getAvgScoreLeaderboard({ area, limit, offset });
      return jsonOk({ type, rows, minGames: getMinGames() });
    }
    if (type === "kda") {
      const sortRaw = searchParams.get("sortBy") || "kda";
      const allowed: KdaSortBy[] = ["kda", "kills", "deaths", "assists"];
      const sortBy = (allowed.includes(sortRaw as KdaSortBy)
        ? sortRaw
        : "kda") as KdaSortBy;
      const rows = await getKdaLeaderboard({ area, limit, offset, sortBy });
      return jsonOk({ type, rows, minGames: getMinGames(), sortBy });
    }
    if (type === "hero") {
      if (!heroName) return jsonError("请指定英雄名称", 400);
      const sortRaw = searchParams.get("sortBy") || "composite";
      const allowed: HeroSortBy[] = [
        "composite",
        "winRate",
        "games",
        "avgKda",
        "avgScore",
      ];
      const sortBy = (allowed.includes(sortRaw as HeroSortBy)
        ? sortRaw
        : "composite") as HeroSortBy;
      const rows = await getHeroLeaderboard({
        heroName,
        area,
        limit,
        offset,
        sortBy,
      });
      return jsonOk({ type, rows, heroName, minGames: 1, sortBy });
    }
    if (type === "active") {
      const rows = await getActiveLeaderboard({ area, limit });
      return jsonOk({ type, rows });
    }
    return jsonError("未知榜单类型", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "heroes") {
      const heroes = await prisma.heroStat.groupBy({
        by: ["heroName"],
        _sum: { games: true },
        orderBy: { _sum: { games: "desc" } },
        take: 80,
      });
      return jsonOk({
        heroes: heroes.map((h) => ({
          name: h.heroName,
          games: h._sum.games || 0,
        })),
      });
    }
    return jsonError("未知操作", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
