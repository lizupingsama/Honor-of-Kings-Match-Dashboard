import { prisma } from "./db";
import { clampRating, clampWinRate } from "./rating";

export type ScoreMetric = "rankScore" | "peakRating" | "peakScore" | "winRate";

export async function recordScoreSnapshot(
  playerId: string,
  opts: {
    rankScore?: number | null;
    peakRating?: number | null;
    peakScore?: number | null;
    winRate?: number | null;
    source?: "sync" | "manual";
    recordedAt?: Date;
    note?: string | null;
  },
) {
  const rankScore =
    opts.rankScore != null ? clampRating(opts.rankScore) : undefined;
  const peakRating =
    opts.peakRating != null ? clampRating(opts.peakRating) : undefined;
  const peakScore = opts.peakScore != null ? opts.peakScore : undefined;
  const winRate = opts.winRate != null ? clampWinRate(opts.winRate) : undefined;

  const hasAny =
    rankScore != null || peakRating != null || peakScore != null || winRate != null;
  if (!hasAny) return null;

  return prisma.scoreHistory.create({
    data: {
      playerId,
      recordedAt: opts.recordedAt ?? new Date(),
      rankScore,
      peakRating,
      peakScore,
      winRate,
      source: opts.source ?? "manual",
      note: opts.note ?? undefined,
    },
  });
}

export async function recordHeroPowerSnapshot(
  playerId: string,
  opts: {
    heroName: string;
    heroId?: string | null;
    combatPower: number;
    source?: "sync" | "manual";
    recordedAt?: Date;
    note?: string | null;
    applyToStat?: boolean;
  },
) {
  const history = await prisma.heroPowerHistory.create({
    data: {
      playerId,
      heroName: opts.heroName,
      heroId: opts.heroId ?? undefined,
      combatPower: opts.combatPower,
      recordedAt: opts.recordedAt ?? new Date(),
      source: opts.source ?? "manual",
      note: opts.note ?? undefined,
    },
  });

  if (opts.applyToStat !== false) {
    await prisma.heroStat.upsert({
      where: {
        playerId_heroName: { playerId, heroName: opts.heroName },
      },
      create: {
        playerId,
        heroName: opts.heroName,
        heroId: opts.heroId ?? undefined,
        combatPower: opts.combatPower,
      },
      update: {
        combatPower: opts.combatPower,
        ...(opts.heroId ? { heroId: opts.heroId } : {}),
      },
    });
  }

  return history;
}

export async function getPlayerScoreSeries(
  gameNickname: string,
  metric: ScoreMetric,
) {
  const player = await prisma.player.findUnique({
    where: { gameNickname },
    select: {
      id: true,
      rankScore: true,
      peakRating: true,
      peakScore: true,
      seasonWins: true,
      seasonGames: true,
    },
  });
  if (!player) return [];

  const rows = await prisma.scoreHistory.findMany({
    where: {
      playerId: player.id,
      [metric]: { not: null },
    },
    orderBy: { recordedAt: "asc" },
    select: {
      recordedAt: true,
      rankScore: true,
      peakRating: true,
      peakScore: true,
      winRate: true,
      source: true,
    },
  });

  const series = rows.map((r) => ({
    t: r.recordedAt.toISOString(),
    value: r[metric] as number,
    source: r.source,
  }));

  if (!series.length) {
    if (metric === "winRate") {
      const current = player.seasonGames
        ? clampWinRate((player.seasonWins / player.seasonGames) * 100)
        : 0;
      if (current > 0) {
        return [{ t: new Date().toISOString(), value: current, source: "current" }];
      }
      return [];
    }
    const current = player[metric as "rankScore" | "peakRating" | "peakScore"];
    if (typeof current === "number" && current > 0) {
      return [{ t: new Date().toISOString(), value: current, source: "current" }];
    }
  }

  return series;
}

/** 段位曲线：与个人页一致，仅排位对局的段位换算分 */
export async function getTierScoreSeries(gameNickname: string) {
  const player = await prisma.player.findUnique({
    where: { gameNickname },
    select: { id: true, tierScore: true, currentRank: true, currentStars: true },
  });
  if (!player) return [];

  const matches = await prisma.match.findMany({
    where: {
      playerId: player.id,
      mode: "ranked",
      rankScore: { not: null },
    },
    orderBy: { playedAt: "asc" },
    select: {
      playedAt: true,
      rankScore: true,
      rankName: true,
      stars: true,
      heroName: true,
      result: true,
    },
  });

  if (matches.length) {
    return matches.map((m) => ({
      t: m.playedAt.toISOString(),
      value: m.rankScore as number,
      score: m.rankScore as number,
      label: m.rankName,
      stars: m.stars,
      source: "sync",
      hero: m.heroName,
      result: m.result,
    }));
  }

  if (player.tierScore > 0) {
    return [
      {
        t: new Date().toISOString(),
        value: player.tierScore,
        score: player.tierScore,
        label: player.currentRank,
        stars: player.currentStars,
        source: "current",
      },
    ];
  }
  return [];
}

/** 巅峰分曲线：与个人页一致，来自巅峰对局的 peakScore */
export async function getPeakMatchSeries(gameNickname: string) {
  const player = await prisma.player.findUnique({
    where: { gameNickname },
    select: { id: true, peakScore: true },
  });
  if (!player) return [];

  const matches = await prisma.match.findMany({
    where: {
      playerId: player.id,
      mode: "peak",
      peakScore: { not: null },
    },
    orderBy: { playedAt: "asc" },
    select: {
      playedAt: true,
      peakScore: true,
      heroName: true,
      result: true,
    },
  });

  if (matches.length) {
    return matches.map((m) => ({
      t: m.playedAt.toISOString(),
      value: m.peakScore as number,
      source: "sync",
      hero: m.heroName,
      result: m.result,
    }));
  }

  if (player.peakScore > 0) {
    return [
      {
        t: new Date().toISOString(),
        value: player.peakScore,
        source: "current",
      },
    ];
  }
  return [];
}

export async function getHeroPowerSeries(gameNickname: string, heroName: string) {
  const player = await prisma.player.findUnique({
    where: { gameNickname },
    select: { id: true },
  });
  if (!player) return [];

  // 优先用对局详情里的 fightPower，按对局时间形成曲线（与巅峰分曲线一致）
  const matches = await prisma.match.findMany({
    where: {
      playerId: player.id,
      heroName,
      combatPower: { gt: 0 },
    },
    orderBy: { playedAt: "asc" },
    select: {
      playedAt: true,
      combatPower: true,
      result: true,
    },
  });
  if (matches.length) {
    return matches.map((m) => ({
      t: m.playedAt.toISOString(),
      value: m.combatPower as number,
      source: "sync",
      result: m.result,
    }));
  }

  const rows = await prisma.heroPowerHistory.findMany({
    where: { playerId: player.id, heroName },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true, combatPower: true, source: true },
  });

  if (rows.length) {
    return rows.map((r) => ({
      t: r.recordedAt.toISOString(),
      value: r.combatPower,
      source: r.source,
    }));
  }

  const stat = await prisma.heroStat.findUnique({
    where: {
      playerId_heroName: { playerId: player.id, heroName },
    },
    select: { combatPower: true },
  });
  if (stat && stat.combatPower > 0) {
    return [
      {
        t: new Date().toISOString(),
        value: stat.combatPower,
        source: "current",
      },
    ];
  }
  return [];
}
