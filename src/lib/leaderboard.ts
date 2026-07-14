import { prisma } from "./db";

const MIN_GAMES = Number(process.env.LEADERBOARD_MIN_GAMES || "20") || 20;

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
    area: s.player.area,
    heroName: s.heroName,
    heroIcon: s.heroIcon,
    combatPower: s.combatPower,
    games: s.games,
    wins: s.wins,
    winRate: winRateOf(s.wins, s.games),
  }));
}

export async function getWinRateLeaderboard(opts?: {
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
}) {
  const minGames = opts?.minGames ?? MIN_GAMES;
  const limit = opts?.limit ?? 100;
  const offset = opts?.offset ?? 0;

  const players = await prisma.player.findMany({
    where: {
      seasonGames: { gte: minGames },
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
  });

  return players
    .map((p) => ({
      gameNickname: p.gameNickname,
      area: p.area,
      currentRank: p.currentRank,
      currentStars: p.currentStars,
      rankScore: p.rankScore,
      peakRating: p.peakRating,
      peakScore: p.peakScore,
      seasonGames: p.seasonGames,
      seasonWins: p.seasonWins,
      winRate: p.seasonGames ? (p.seasonWins / p.seasonGames) * 100 : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.seasonGames - a.seasonGames)
    .slice(offset, offset + limit)
    .map((row, i) => ({
      ...row,
      rank: offset + i + 1,
      winRate: Math.round(row.winRate * 10) / 10,
    }));
}

export async function getHeroLeaderboard(opts: {
  heroName: string;
  area?: string;
  limit?: number;
  offset?: number;
  minGames?: number;
}) {
  const minGames = opts.minGames ?? 10;
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

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

  return stats
    .map((s) => ({
      gameNickname: s.player.gameNickname,
      area: s.player.area,
      heroName: s.heroName,
      heroIcon: s.heroIcon,
      games: s.games,
      wins: s.wins,
      winRate: s.games ? (s.wins / s.games) * 100 : 0,
      avgKda:
        s.deaths === 0
          ? s.kills + s.assists
          : Math.round(((s.kills + s.assists) / s.deaths) * 100) / 100,
      avgScore: s.games ? Math.round((s.totalScore / s.games) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.games - a.games || b.avgScore - a.avgScore)
    .slice(offset, offset + limit)
    .map((row, i) => ({
      ...row,
      rank: offset + i + 1,
      winRate: Math.round(row.winRate * 10) / 10,
    }));
}

export async function getActiveLeaderboard(opts?: {
  area?: string;
  limit?: number;
  days?: number;
}) {
  const days = opts?.days ?? 7;
  const limit = opts?.limit ?? 100;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const players = await prisma.player.findMany({
    where: {
      ...(opts?.area && opts.area !== "all" ? { area: opts.area } : {}),
    },
    include: {
      matches: {
        where: { playedAt: { gte: since } },
        select: { id: true },
      },
    },
  });

  return players
    .map((p) => ({
      gameNickname: p.gameNickname,
      area: p.area,
      games: p.matches.length,
      currentRank: p.currentRank,
      currentStars: p.currentStars,
      rankScore: p.rankScore,
      peakRating: p.peakRating,
      peakScore: p.peakScore,
    }))
    .filter((p) => p.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, limit)
    .map((row, i) => ({ ...row, rank: i + 1 }));
}
