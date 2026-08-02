import {
  getRankLeaderboard,
  getRankRatingLeaderboard,
  getPeakRatingLeaderboard,
  getPeakLeaderboard,
  getPowerLeaderboard,
  getWinRateLeaderboard,
  getAvgScoreLeaderboard,
  getKdaLeaderboard,
  getContributionLeaderboard,
  getHeroLeaderboard,
  getMedalLeaderboard,
  getEquipmentLeaderboard,
  getActiveLeaderboard,
  getMinGames,
  type HeroSortBy,
  type WinRateSortBy,
  type KdaSortBy,
  type ContributionSortBy,
  type MedalSortBy,
} from "@/lib/leaderboard";
import { isEquipmentBoardCategory } from "@/lib/equipment";
import {
  getPlayerScoreSeries,
  getTierScoreSeries,
  getPeakMatchSeries,
  getHeroPowerSeries,
  type ScoreMetric,
} from "@/lib/score-history";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/ttl-cache";

/** 榜单结果缓存时长：同步频率远低于访问频率，30s 内返回同一份结果 */
const LEADERBOARD_CACHE_TTL_MS = 30_000;

const KNOWN_TYPES = new Set([
  "score",
  "rank",
  "peak",
  "power",
  "winrate",
  "avgscore",
  "kda",
  "contribution",
  "hero",
  "medal",
  "equipment",
  "active",
]);

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
    const equipmentCategoryRaw = searchParams.get("category") || "all";
    const equipmentCategory = isEquipmentBoardCategory(equipmentCategoryRaw)
      ? equipmentCategoryRaw
      : "all";

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

    if (!KNOWN_TYPES.has(type)) return jsonError("未知榜单类型", 400);
    if ((type === "power" || type === "hero") && !heroName) {
      return jsonError("请指定英雄名称", 400);
    }

    const sortRaw = searchParams.get("sortBy") || "";
    const cacheKey = [
      "lb",
      type,
      area,
      heroName,
      limit,
      offset,
      sortRaw,
      scoreMode,
      equipmentCategory,
    ].join("|");
    const payload = await cached(cacheKey, LEADERBOARD_CACHE_TTL_MS, async (): Promise<Record<string, unknown>> => {
      if (type === "score") {
        if (scoreMode === "peak") {
          const rows = await getPeakRatingLeaderboard({ area, limit, offset });
          return { type, scoreMode: "peak", rows };
        }
        const rows = await getRankRatingLeaderboard({ area, limit, offset });
        return { type, scoreMode: "ranked", rows };
      }
      if (type === "rank") {
        const rows = await getRankLeaderboard({ area, limit, offset });
        return { type, rows };
      }
      if (type === "peak") {
        const rows = await getPeakLeaderboard({ area, limit, offset });
        return { type, rows };
      }
      if (type === "power") {
        const rows = await getPowerLeaderboard({ heroName, area, limit, offset });
        return { type, rows, heroName };
      }
      if (type === "winrate") {
        const allowed: WinRateSortBy[] = ["winRate", "wins"];
        const sortBy = (allowed.includes(sortRaw as WinRateSortBy)
          ? sortRaw
          : "winRate") as WinRateSortBy;
        const rows = await getWinRateLeaderboard({ area, limit, offset, sortBy });
        return { type, rows, minGames: getMinGames(), sortBy };
      }
      if (type === "avgscore") {
        const rows = await getAvgScoreLeaderboard({ area, limit, offset });
        return { type, rows, minGames: getMinGames() };
      }
      if (type === "kda") {
        const allowed: KdaSortBy[] = ["kda", "kills", "deaths", "assists"];
        const sortBy = (allowed.includes(sortRaw as KdaSortBy)
          ? sortRaw
          : "kda") as KdaSortBy;
        const rows = await getKdaLeaderboard({ area, limit, offset, sortBy });
        return { type, rows, minGames: getMinGames(), sortBy };
      }
      if (type === "contribution") {
        const allowed: ContributionSortBy[] = [
          "damage",
          "taken",
          "join",
          "economy",
        ];
        const sortBy = (allowed.includes(sortRaw as ContributionSortBy)
          ? sortRaw
          : "damage") as ContributionSortBy;
        const rows = await getContributionLeaderboard({
          area,
          limit,
          offset,
          sortBy,
        });
        return { type, rows, minGames: getMinGames(), sortBy };
      }
      if (type === "hero") {
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
        return { type, rows, heroName, minGames: 1, sortBy };
      }
      if (type === "medal") {
        const allowed: MedalSortBy[] = ["total", "top", "gold", "silver", "bronze"];
        const sortBy = (allowed.includes(sortRaw as MedalSortBy)
          ? sortRaw
          : "total") as MedalSortBy;
        const rows = await getMedalLeaderboard({ area, limit, offset, sortBy });
        return { type, rows, sortBy };
      }
      if (type === "equipment") {
        const payload = await getEquipmentLeaderboard({
          area,
          category: equipmentCategory,
          limit,
          offset,
        });
        return { type, category: equipmentCategory, ...payload };
      }
      // type === "active"（KNOWN_TYPES 已校验）
      const rows = await getActiveLeaderboard({ area, limit });
      return { type, rows };
    });
    return jsonOk(payload);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "heroes") {
      // 战力榜：只返回本地已有战力的英雄，按最高战力排序
      if (body?.forPower) {
        const payload = await cached("heroes|power", LEADERBOARD_CACHE_TTL_MS, async () => {
          const heroes = await prisma.heroStat.groupBy({
            by: ["heroName"],
            where: { combatPower: { gt: 0 } },
            _max: { combatPower: true },
            _count: { _all: true },
            orderBy: { _max: { combatPower: "desc" } },
            take: 80,
          });
          return {
            heroes: heroes.map((h) => ({
              name: h.heroName,
              combatPower: h._max.combatPower || 0,
              players: h._count._all,
            })),
          };
        });
        return jsonOk(payload);
      }

      const payload = await cached("heroes|games", LEADERBOARD_CACHE_TTL_MS, async () => {
        const heroes = await prisma.heroStat.groupBy({
          by: ["heroName"],
          _sum: { games: true },
          orderBy: { _sum: { games: "desc" } },
          take: 80,
        });
        return {
          heroes: heroes.map((h) => ({
            name: h.heroName,
            games: h._sum.games || 0,
          })),
        };
      });
      return jsonOk(payload);
    }
    return jsonError("未知操作", 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
