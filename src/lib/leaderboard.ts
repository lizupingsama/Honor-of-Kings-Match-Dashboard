import { prisma } from "./db";

const MIN_GAMES = Number(process.env.LEADERBOARD_MIN_GAMES || "10") || 10;

export function getMinGames() {
  return MIN_GAMES;
}

function winRateOf(wins: number, games: number) {
  return games ? Math.round((wins / games) * 1000) / 10 : 0;
}

export async function getRankLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const players = await prisma.player.findMany({
    where: {
      tierScore: { gt: 0 },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    orderBy: [{ tierScore: "desc" }, { currentStars: "desc" }],
    take: limit,
    skip: offset,
  });

  return players.map((p, i) => ({
    rank: offset + i + 1,
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    currentRank: p.currentRank,
    currentStars: p.currentStars,
    tierScore: p.tierScore,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
    seasonGames: p.seasonGames,
    seasonWins: p.seasonWins,
    winRate: winRateOf(p.seasonWins, p.seasonGames),
  }));
}

/** 评分榜：排位评分 0–110 */
export async function getRankRatingLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const players = await prisma.player.findMany({
    where: {
      rankScore: { gt: 0, lte: 110 },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    orderBy: [{ rankScore: "desc" }],
    take: limit,
    skip: offset,
  });

  return players.map((p, i) => ({
    rank: offset + i + 1,
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
  }));
}

export async function getPeakRatingLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const players = await prisma.player.findMany({
    where: {
      peakRating: { gt: 0, lte: 110 },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    orderBy: [{ peakRating: "desc" }],
    take: limit,
    skip: offset,
  });

  return players.map((p, i) => ({
    rank: offset + i + 1,
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    currentRank: p.currentRank,
    currentStars: p.currentStars,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
    seasonGames: p.seasonGames,
    seasonWins: p.seasonWins,
    winRate: winRateOf(p.seasonWins, p.seasonGames),
  }));
}

export async function getPeakLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const players = await prisma.player.findMany({
    where: {
      peakScore: { gt: 0 },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    orderBy: [{ peakScore: "desc" }],
    take: limit,
    skip: offset,
  });

  return players.map((p, i) => ({
    rank: offset + i + 1,
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    currentRank: p.currentRank,
    currentStars: p.currentStars,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
    seasonGames: p.seasonGames,
    seasonWins: p.seasonWins,
    winRate: winRateOf(p.seasonWins, p.seasonGames),
  }));
}

export async function getPowerLeaderboard(opts: {
  heroName: string;
  area?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const stats = await prisma.heroStat.findMany({
    where: {
      heroName: opts.heroName,
      combatPower: { gt: 0 },
      player: {
        ...(opts.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    include: { player: true },
    orderBy: [{ combatPower: "desc" }],
    take: limit,
    skip: offset,
  });

  return stats.map((s, i) => ({
    rank: offset + i + 1,
    gameNickname: s.player.gameNickname,
    gameAvatarUrl: s.player.gameAvatarUrl,
    area: s.player.area,
    heroName: s.heroName,
    heroIcon: s.heroIcon,
    combatPower: s.combatPower,
    games: s.games,
    wins: s.wins,
    winRate: winRateOf(s.wins, s.games),
  }));
}

export type WinRateSortBy = "winRate" | "wins";

export async function getWinRateLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
  sortBy?: WinRateSortBy;
}) {
  const minGames = opts?.minGames ?? MIN_GAMES;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const sortBy = opts?.sortBy ?? "winRate";

  const players = await prisma.player.findMany({
    where: {
      seasonGames: { gte: minGames },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
  });

  const rows = players.map((p) => ({
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    currentRank: p.currentRank,
    currentStars: p.currentStars,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
    seasonGames: p.seasonGames,
    seasonWins: p.seasonWins,
    winRate: p.seasonGames ? (p.seasonWins / p.seasonGames) * 100 : 0,
  }));

  rows.sort((a, b) => {
    if (sortBy === "wins") {
      return b.seasonWins - a.seasonWins || b.winRate - a.winRate || b.seasonGames - a.seasonGames;
    }
    return b.winRate - a.winRate || b.seasonWins - a.seasonWins || b.seasonGames - a.seasonGames;
  });

  return rows.slice(offset, offset + limit).map((row, i) => ({
    ...row,
    rank: offset + i + 1,
    winRate: Math.round(row.winRate * 10) / 10,
  }));
}

/** 单局平均评分榜：本地已同步对局的 score 均值 */
export async function getAvgScoreLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
}) {
  const minGames = opts?.minGames ?? MIN_GAMES;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const grouped = await prisma.match.groupBy({
    by: ["playerId"],
    where: {
      score: { not: null },
      player: {
        lastSyncAt: { not: null },
        ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    _avg: { score: true },
    _count: { _all: true },
  });

  const qualified = grouped
    .filter((g) => g._count._all >= minGames && g._avg.score != null)
    .sort(
      (a, b) =>
        (b._avg.score ?? 0) - (a._avg.score ?? 0) || b._count._all - a._count._all,
    )
    .slice(offset, offset + limit);

  if (!qualified.length) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: qualified.map((g) => g.playerId) } },
    select: {
      id: true,
      gameNickname: true,
      gameAvatarUrl: true,
      area: true,
      currentRank: true,
      currentStars: true,
    },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  return qualified
    .map((g, i) => {
      const p = byId.get(g.playerId);
      if (!p) return null;
      return {
        rank: offset + i + 1,
        gameNickname: p.gameNickname,
        gameAvatarUrl: p.gameAvatarUrl,
        area: p.area,
        currentRank: p.currentRank,
        currentStars: p.currentStars,
        avgScore: Math.round((g._avg.score as number) * 10) / 10,
        games: g._count._all,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
}

export type KdaSortBy = "kda" | "kills" | "deaths" | "assists";

/** KDA 榜：场均击杀 / 死亡 / 助攻，以及综合 KDA */
export async function getKdaLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
  sortBy?: KdaSortBy;
}) {
  const minGames = opts?.minGames ?? MIN_GAMES;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const sortBy = opts?.sortBy ?? "kda";

  const grouped = await prisma.match.groupBy({
    by: ["playerId"],
    where: {
      player: {
        lastSyncAt: { not: null },
        ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    _sum: { kills: true, deaths: true, assists: true },
    _count: { _all: true },
  });

  const rows = grouped
    .filter((g) => g._count._all >= minGames)
    .map((g) => {
      const games = g._count._all;
      const kills = g._sum.kills ?? 0;
      const deaths = g._sum.deaths ?? 0;
      const assists = g._sum.assists ?? 0;
      const avgKills = Math.round((kills / games) * 100) / 100;
      const avgDeaths = Math.round((deaths / games) * 100) / 100;
      const avgAssists = Math.round((assists / games) * 100) / 100;
      const avgKda =
        deaths === 0
          ? Math.round((kills + assists) * 100) / 100
          : Math.round(((kills + assists) / deaths) * 100) / 100;
      return {
        playerId: g.playerId,
        games,
        avgKills,
        avgDeaths,
        avgAssists,
        avgKda,
      };
    });

  rows.sort((a, b) => {
    if (sortBy === "kills") {
      return b.avgKills - a.avgKills || b.avgKda - a.avgKda || b.games - a.games;
    }
    if (sortBy === "deaths") {
      return b.avgDeaths - a.avgDeaths || b.avgKda - a.avgKda || b.games - a.games;
    }
    if (sortBy === "assists") {
      return b.avgAssists - a.avgAssists || b.avgKda - a.avgKda || b.games - a.games;
    }
    return b.avgKda - a.avgKda || b.games - a.games || b.avgKills - a.avgKills;
  });

  const page = rows.slice(offset, offset + limit);
  if (!page.length) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: page.map((r) => r.playerId) } },
    select: {
      id: true,
      gameNickname: true,
      gameAvatarUrl: true,
      area: true,
      currentRank: true,
      currentStars: true,
    },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  return page
    .map((r, i) => {
      const p = byId.get(r.playerId);
      if (!p) return null;
      return {
        rank: offset + i + 1,
        gameNickname: p.gameNickname,
        gameAvatarUrl: p.gameAvatarUrl,
        area: p.area,
        currentRank: p.currentRank,
        currentStars: p.currentStars,
        games: r.games,
        avgKills: r.avgKills,
        avgDeaths: r.avgDeaths,
        avgAssists: r.avgAssists,
        avgKda: r.avgKda,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
}

export type ContributionSortBy = "damage" | "taken" | "join" | "economy";

/** 团队贡献榜：分均经济 / 场均输出 / 承伤 / 参团（仅统计四项均有数据的对局） */
export async function getContributionLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
  sortBy?: ContributionSortBy;
}) {
  const minGames = opts?.minGames ?? MIN_GAMES;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const sortBy = opts?.sortBy ?? "damage";

  const grouped = await prisma.match.groupBy({
    by: ["playerId"],
    where: {
      damage: { not: null },
      takenDamage: { not: null },
      joinPct: { not: null },
      economy: { not: null },
      durationSec: { gt: 0 },
      player: {
        lastSyncAt: { not: null },
        ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    _avg: { damage: true, takenDamage: true, joinPct: true },
    _sum: { economy: true, durationSec: true },
    _count: { _all: true },
  });

  const rows = grouped
    .filter(
      (g) =>
        g._count._all >= minGames &&
        g._avg.damage != null &&
        g._avg.takenDamage != null &&
        g._avg.joinPct != null &&
        (g._sum.durationSec ?? 0) > 0,
    )
    .map((g) => {
      const totalDurationSec = g._sum.durationSec as number;
      const totalEconomy = g._sum.economy ?? 0;
      return {
        playerId: g.playerId,
        games: g._count._all,
        avgEconomyPerMin:
          Math.round((totalEconomy / (totalDurationSec / 60)) * 10) / 10,
        avgDamage: Math.round(g._avg.damage as number),
        avgTakenDamage: Math.round(g._avg.takenDamage as number),
        avgJoinPct: Math.round((g._avg.joinPct as number) * 10) / 10,
      };
    });

  rows.sort((a, b) => {
    if (sortBy === "taken") {
      return (
        b.avgTakenDamage - a.avgTakenDamage ||
        b.avgDamage - a.avgDamage ||
        b.games - a.games
      );
    }
    if (sortBy === "join") {
      return (
        b.avgJoinPct - a.avgJoinPct ||
        b.avgDamage - a.avgDamage ||
        b.games - a.games
      );
    }
    if (sortBy === "economy") {
      return (
        b.avgEconomyPerMin - a.avgEconomyPerMin ||
        b.avgDamage - a.avgDamage ||
        b.games - a.games
      );
    }
    return (
      b.avgDamage - a.avgDamage ||
      b.avgTakenDamage - a.avgTakenDamage ||
      b.games - a.games
    );
  });

  const page = rows.slice(offset, offset + limit);
  if (!page.length) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: page.map((r) => r.playerId) } },
    select: {
      id: true,
      gameNickname: true,
      gameAvatarUrl: true,
      area: true,
      currentRank: true,
      currentStars: true,
    },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  return page
    .map((r, i) => {
      const p = byId.get(r.playerId);
      if (!p) return null;
      return {
        rank: offset + i + 1,
        gameNickname: p.gameNickname,
        gameAvatarUrl: p.gameAvatarUrl,
        area: p.area,
        currentRank: p.currentRank,
        currentStars: p.currentStars,
        games: r.games,
        avgEconomyPerMin: r.avgEconomyPerMin,
        avgDamage: r.avgDamage,
        avgTakenDamage: r.avgTakenDamage,
        avgJoinPct: r.avgJoinPct,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
}

export type HeroSortBy = "composite" | "winRate" | "games" | "avgKda" | "avgScore";

/**
 * 英雄综合分（0–100 量级）：
 * 质量分 = 胜率×45% + 标准化KDA×30% + 标准化评分×25%
 *   - KDA 按 10 封顶折算到 0–100
 *   - 本场评分按 12 封顶折算到 0–100
 * 再乘场次可信度：1 场约 0.41，10 场及以上为 1（避免极少场次虚高）
 */
export function heroCompositeScore(row: {
  winRate: number;
  avgKda: number;
  avgScore: number;
  games: number;
}) {
  const wr = Math.max(0, Math.min(100, row.winRate));
  const kda = (Math.min(Math.max(row.avgKda, 0), 10) / 10) * 100;
  const score = (Math.min(Math.max(row.avgScore, 0), 12) / 12) * 100;
  const quality = wr * 0.45 + kda * 0.3 + score * 0.25;
  const confidence = 0.35 + (0.65 * Math.min(Math.max(row.games, 0), 10)) / 10;
  return Math.round(quality * confidence * 10) / 10;
}

export async function getHeroLeaderboard(opts: {
  heroName: string;
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
  sortBy?: HeroSortBy;
}) {
  const minGames = opts.minGames ?? 1;
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;
  const sortBy = opts.sortBy ?? "composite";

  const stats = await prisma.heroStat.findMany({
    where: {
      heroName: opts.heroName,
      games: { gte: minGames },
      player: {
        lastSyncAt: { not: null },
        ...(opts.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    include: { player: true },
  });

  const rows = stats.map((s) => {
    const winRate = s.games ? (s.wins / s.games) * 100 : 0;
    const avgKda =
      s.deaths === 0
        ? s.kills + s.assists
        : Math.round(((s.kills + s.assists) / s.deaths) * 100) / 100;
    const scoreGames = s.scoreGames || 0;
    const avgScore = scoreGames
      ? Math.round((s.totalScore / scoreGames) * 10) / 10
      : s.games
        ? Math.round((s.totalScore / s.games) * 10) / 10
        : 0;
    const base = {
      gameNickname: s.player.gameNickname,
      gameAvatarUrl: s.player.gameAvatarUrl,
      area: s.player.area,
      heroName: s.heroName,
      heroIcon: s.heroIcon,
      games: s.games,
      wins: s.wins,
      winRate,
      avgKda,
      avgScore,
    };
    return {
      ...base,
      composite: heroCompositeScore(base),
    };
  });

  rows.sort((a, b) => {
    if (sortBy === "games") {
      return b.games - a.games || b.winRate - a.winRate || b.avgScore - a.avgScore;
    }
    if (sortBy === "avgKda") {
      return b.avgKda - a.avgKda || b.games - a.games || b.winRate - a.winRate;
    }
    if (sortBy === "avgScore") {
      return b.avgScore - a.avgScore || b.games - a.games || b.winRate - a.winRate;
    }
    if (sortBy === "winRate") {
      return b.winRate - a.winRate || b.games - a.games || b.avgScore - a.avgScore;
    }
    // composite（默认）
    return b.composite - a.composite || b.games - a.games || b.winRate - a.winRate;
  });

  return rows.slice(offset, offset + limit).map((row, i) => ({
    ...row,
    rank: offset + i + 1,
    winRate: Math.round(row.winRate * 10) / 10,
  }));
}

export type MedalSortBy = "total" | "top" | "gold" | "silver" | "bronze";

/**
 * 奖牌榜：按本地已同步对局中的 金/银/铜牌 计数。
 * total = 三种牌子数量之和；top = 顶级排序（金牌优先，依次银牌、铜牌）。
 */
export async function getMedalLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  sortBy?: MedalSortBy;
}) {
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;
  const sortBy = opts?.sortBy ?? "total";

  const grouped = await prisma.match.groupBy({
    by: ["playerId", "medal"],
    where: {
      medal: { not: null },
      player: {
        lastSyncAt: { not: null },
        ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
      },
    },
    _count: { _all: true },
  });

  const counts = new Map<
    string,
    { gold: number; silver: number; bronze: number }
  >();
  for (const g of grouped) {
    const medal = g.medal ?? "";
    let tier: "gold" | "silver" | "bronze" | null = null;
    if (medal.startsWith("金牌")) tier = "gold";
    else if (medal.startsWith("银牌")) tier = "silver";
    else if (medal.startsWith("铜牌")) tier = "bronze";
    if (!tier) continue;
    const entry = counts.get(g.playerId) ?? { gold: 0, silver: 0, bronze: 0 };
    entry[tier] += g._count._all;
    counts.set(g.playerId, entry);
  }

  const rows = [...counts.entries()].map(([playerId, c]) => ({
    playerId,
    goldMedals: c.gold,
    silverMedals: c.silver,
    bronzeMedals: c.bronze,
    totalMedals: c.gold + c.silver + c.bronze,
  }));

  rows.sort((a, b) => {
    if (sortBy === "top") {
      return (
        b.goldMedals - a.goldMedals ||
        b.silverMedals - a.silverMedals ||
        b.bronzeMedals - a.bronzeMedals
      );
    }
    if (sortBy === "gold") {
      return (
        b.goldMedals - a.goldMedals ||
        b.totalMedals - a.totalMedals ||
        b.silverMedals - a.silverMedals
      );
    }
    if (sortBy === "silver") {
      return (
        b.silverMedals - a.silverMedals ||
        b.totalMedals - a.totalMedals ||
        b.goldMedals - a.goldMedals
      );
    }
    if (sortBy === "bronze") {
      return (
        b.bronzeMedals - a.bronzeMedals ||
        b.totalMedals - a.totalMedals ||
        b.goldMedals - a.goldMedals
      );
    }
    return (
      b.totalMedals - a.totalMedals ||
      b.goldMedals - a.goldMedals ||
      b.silverMedals - a.silverMedals
    );
  });

  const page = rows.slice(offset, offset + limit);
  if (!page.length) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: page.map((r) => r.playerId) } },
    select: {
      id: true,
      gameNickname: true,
      gameAvatarUrl: true,
      area: true,
      currentRank: true,
      currentStars: true,
    },
  });
  const byId = new Map(players.map((p) => [p.id, p]));

  return page
    .map((r, i) => {
      const p = byId.get(r.playerId);
      if (!p) return null;
      return {
        rank: offset + i + 1,
        gameNickname: p.gameNickname,
        gameAvatarUrl: p.gameAvatarUrl,
        area: p.area,
        currentRank: p.currentRank,
        currentStars: p.currentStars,
        goldMedals: r.goldMedals,
        silverMedals: r.silverMedals,
        bronzeMedals: r.bronzeMedals,
        totalMedals: r.totalMedals,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);
}

export async function getActiveLeaderboard(opts?: {
  area?: string;
  limit?: number;
}) {
  const limit = opts?.limit ?? 100;

  const players = await prisma.player.findMany({
    where: {
      seasonGames: { gt: 0 },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    orderBy: [{ seasonGames: "desc" }, { seasonWins: "desc" }],
    take: limit,
  });

  return players.map((p, i) => ({
    rank: i + 1,
    gameNickname: p.gameNickname,
    gameAvatarUrl: p.gameAvatarUrl,
    area: p.area,
    games: p.seasonGames,
    seasonGames: p.seasonGames,
    seasonWins: p.seasonWins,
    currentRank: p.currentRank,
    currentStars: p.currentStars,
    rankScore: p.rankScore,
    peakRating: p.peakRating,
    peakScore: p.peakScore,
  }));
}
