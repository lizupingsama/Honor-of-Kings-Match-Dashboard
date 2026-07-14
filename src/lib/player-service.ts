import { prisma } from "./db";
import { getWzryApiClient, WzryApiError } from "./wzry-api";
import { parseRankScore } from "./rank";
import { recordScoreSnapshot } from "./score-history";

const COOLDOWN = Number(process.env.SYNC_COOLDOWN_SECONDS || "300") || 300;

export function getCooldownSeconds() {
  return COOLDOWN;
}

export class PlayerServiceError extends Error {
  status: number;
  retryAfter?: number;
  constructor(message: string, status = 400, retryAfter?: number) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export async function recomputeHeroStats(playerId: string) {
  const existing = await prisma.heroStat.findMany({
    where: { playerId },
    select: { heroName: true, combatPower: true },
  });
  const powerMap = new Map(existing.map((s) => [s.heroName, s.combatPower]));

  const matches = await prisma.match.findMany({ where: { playerId } });
  const map = new Map<
    string,
    {
      heroId?: string | null;
      heroIcon?: string | null;
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      totalScore: number;
    }
  >();

  for (const m of matches) {
    const cur = map.get(m.heroName) || {
      heroId: m.heroId,
      heroIcon: m.heroIcon,
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      totalScore: 0,
    };
    cur.games += 1;
    if (m.result === "win") cur.wins += 1;
    cur.kills += m.kills;
    cur.deaths += m.deaths;
    cur.assists += m.assists;
    cur.totalScore += m.score ?? 0;
    if (m.heroIcon) cur.heroIcon = m.heroIcon;
    if (m.heroId) cur.heroId = m.heroId;
    map.set(m.heroName, cur);
  }

  await prisma.heroStat.deleteMany({ where: { playerId } });
  const rows: Array<{
    playerId: string;
    heroName: string;
    heroId?: string;
    heroIcon?: string;
    combatPower: number;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    totalScore: number;
  }> = [...map.entries()].map(([heroName, s]) => ({
    playerId,
    heroName,
    heroId: s.heroId || undefined,
    heroIcon: s.heroIcon || undefined,
    combatPower: powerMap.get(heroName) ?? 0,
    games: s.games,
    wins: s.wins,
    kills: s.kills,
    deaths: s.deaths,
    assists: s.assists,
    totalScore: s.totalScore,
  }));

  // 保留仅有战力、暂无对局的英雄
  for (const [heroName, combatPower] of powerMap) {
    if (!map.has(heroName) && combatPower > 0) {
      rows.push({
        playerId,
        heroName,
        combatPower,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        totalScore: 0,
      });
    }
  }

  if (rows.length) {
    await prisma.heroStat.createMany({ data: rows });
  }
}

async function persistFetchResult(
  playerId: string,
  nickname: string,
  result: Awaited<ReturnType<ReturnType<typeof getWzryApiClient>["fetchBattles"]>>,
) {
  const tierScore = parseRankScore(result.profile.currentRank, result.profile.currentStars);
  const seasonWins = result.profile.seasonWins ?? 0;
  const seasonGames = result.profile.seasonGames ?? 0;
  const winRate = seasonGames ? (seasonWins / seasonGames) * 100 : 0;

  const updated = await prisma.player.update({
    where: { id: playerId },
    data: {
      gameNickname: nickname,
      campId: result.profile.campId,
      area: result.profile.area || "wechat",
      gameAvatarUrl: result.profile.gameAvatarUrl,
      currentRank: result.profile.currentRank,
      currentStars: result.profile.currentStars,
      tierScore,
      // 不覆盖 0–110 的排位/巅峰评分
      seasonWins,
      seasonGames,
      mvpCount: result.profile.mvpCount ?? 0,
      goldCount: result.profile.goldCount ?? 0,
      lastSyncAt: new Date(),
      lastSyncError: null,
      queryCount: { increment: 1 },
    },
  });

  await recordScoreSnapshot(playerId, {
    rankScore: updated.rankScore || null,
    peakRating: updated.peakRating || null,
    peakScore: updated.peakScore || null,
    winRate,
    source: "sync",
  });

  let pulled = 0;
  for (const m of result.matches) {
    const mRankScore =
      m.rankName != null ? parseRankScore(m.rankName, m.stars ?? 0) : null;

    await prisma.match.upsert({
      where: {
        playerId_externalId: {
          playerId,
          externalId: m.externalId,
        },
      },
      create: {
        playerId,
        externalId: m.externalId,
        playedAt: m.playedAt,
        mode: m.mode,
        modeName: m.modeName,
        heroId: m.heroId,
        heroName: m.heroName,
        heroIcon: m.heroIcon,
        result: m.result,
        kills: m.kills,
        deaths: m.deaths,
        assists: m.assists,
        score: m.score,
        evaluate: m.evaluate,
        durationSec: m.durationSec,
        rankName: m.rankName,
        stars: m.stars,
        rankScore: mRankScore ?? undefined,
        mvp: m.mvp ?? false,
        gold: m.gold ?? false,
        economy: m.economy,
        damage: m.damage,
        rawJson: m.rawJson,
      },
      update: {
        result: m.result,
        kills: m.kills,
        deaths: m.deaths,
        assists: m.assists,
        score: m.score,
        evaluate: m.evaluate,
        rankName: m.rankName,
        stars: m.stars,
        rankScore: mRankScore ?? undefined,
        mvp: m.mvp ?? false,
        gold: m.gold ?? false,
        economy: m.economy,
        damage: m.damage,
      },
    });
    pulled++;
  }

  await recomputeHeroStats(playerId);
  return pulled;
}

/** 按王者名称查询并同步战绩到本地 */
export async function lookupPlayerByNickname(
  nicknameRaw: string,
  opts?: { forceRefresh?: boolean },
) {
  const nickname = nicknameRaw.trim();
  if (!nickname) throw new PlayerServiceError("请输入王者名称", 400);

  const client = getWzryApiClient();
  let hits;
  try {
    hits = await client.searchByNickname(nickname);
  } catch (err) {
    if (err instanceof WzryApiError) {
      const status =
        err.code === "rate_limit"
          ? 429
          : err.code === "config"
            ? 503
            : err.code === "hidden" || err.code === "not_found" || err.code === "invalid_id"
              ? 400
              : 502;
      throw new PlayerServiceError(err.message, status);
    }
    throw new PlayerServiceError("查询失败", 502);
  }

  if (!hits.length) throw new PlayerServiceError("未找到该玩家", 404);

  // 精确优先：游戏名 / 营地昵称，否则取第一条
  const hit =
    hits.find((h) => h.gameNickname === nickname) ||
    hits.find((h) => h.campNickname === nickname) ||
    hits.find((h) => h.gameNickname.toLowerCase() === nickname.toLowerCase()) ||
    hits.find((h) => h.campNickname?.toLowerCase() === nickname.toLowerCase()) ||
    hits[0];

  const displayName = hit.gameNickname;

  let player = await prisma.player.findUnique({ where: { gameNickname: displayName } });
  if (!player) {
    // campId 冲突时按 campId 找回
    player = await prisma.player.findUnique({ where: { campId: hit.campId } });
  }

  const needRefresh =
    opts?.forceRefresh ||
    !player?.lastSyncAt ||
    Date.now() - player.lastSyncAt.getTime() > COOLDOWN * 1000;

  if (!player) {
    player = await prisma.player.create({
      data: {
        gameNickname: displayName,
        campId: hit.campId,
        area: hit.area,
        currentRank: hit.currentRank,
        currentStars: hit.currentStars ?? 0,
        tierScore: parseRankScore(hit.currentRank, hit.currentStars ?? 0),
      },
    });
  } else if (player.gameNickname !== displayName) {
    player = await prisma.player.update({
      where: { id: player.id },
      data: { gameNickname: displayName },
    });
  }

  if (needRefresh) {
    if (player.lastSyncAt && !opts?.forceRefresh) {
      const elapsed = (Date.now() - player.lastSyncAt.getTime()) / 1000;
      // already handled by needRefresh
      void elapsed;
    }

    // 强制刷新时检查冷却
    if (opts?.forceRefresh && player.lastSyncAt) {
      const elapsed = (Date.now() - player.lastSyncAt.getTime()) / 1000;
      if (elapsed < COOLDOWN) {
        const wait = Math.ceil(COOLDOWN - elapsed);
        throw new PlayerServiceError(`刷新冷却中，请 ${wait} 秒后再试`, 429, wait);
      }
    }

    const job = await prisma.syncJob.create({
      data: { playerId: player.id, status: "running" },
    });

    try {
      const result = await client.fetchBattles(hit.campId, {
        num: 60,
        nickname: displayName,
      });
      // 保证展示名为用户查询的王者名
      result.profile.gameNickname = displayName;
      const pulled = await persistFetchResult(player.id, displayName, result);
      await prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "success",
          pulled,
          finishedAt: new Date(),
          message: `同步 ${pulled} 场`,
        },
      });
    } catch (err) {
      const message =
        err instanceof WzryApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "同步失败";
      await prisma.player.update({
        where: { id: player.id },
        data: { lastSyncError: message, lastSyncAt: new Date() },
      });
      await prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "failed", message, finishedAt: new Date() },
      });
      if (err instanceof WzryApiError) {
        throw new PlayerServiceError(
          message,
          err.code === "rate_limit" ? 429 : 400,
        );
      }
      throw new PlayerServiceError(message, 502);
    }
  } else {
    await prisma.player.update({
      where: { id: player.id },
      data: { queryCount: { increment: 1 } },
    });
  }

  return getPlayerDashboard(displayName);
}

export async function getPlayerDashboard(
  nickname: string,
  query?: {
    range?: string;
    mode?: string;
    result?: string;
    hero?: string;
    page?: number;
  },
) {
  const player = await prisma.player.findUnique({
    where: { gameNickname: nickname },
    include: {
      heroStats: { orderBy: { games: "desc" } },
    },
  });

  if (!player) return null;

  const range = query?.range || "30";
  const mode = query?.mode || "all";
  const result = query?.result || "all";
  const hero = query?.hero || "";
  const page = Math.max(1, query?.page || 1);
  const pageSize = 20;

  const since = (() => {
    const now = Date.now();
    if (range === "7") return new Date(now - 7 * 86400000);
    if (range === "30") return new Date(now - 30 * 86400000);
    return null;
  })();

  const where = {
    playerId: player.id,
    ...(since ? { playedAt: { gte: since } } : {}),
    ...(mode !== "all" ? { mode } : {}),
    ...(result !== "all" ? { result } : {}),
    ...(hero ? { heroName: hero } : {}),
  };

  const [total, matches, rankMatches] = await Promise.all([
    prisma.match.count({ where }),
    prisma.match.findMany({
      where,
      orderBy: { playedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.match.findMany({
      where: {
        playerId: player.id,
        mode: "ranked",
        rankScore: { not: null },
        ...(since ? { playedAt: { gte: since } } : {}),
      },
      orderBy: { playedAt: "asc" },
      select: {
        playedAt: true,
        rankScore: true,
        rankName: true,
        stars: true,
        result: true,
        heroName: true,
      },
    }),
  ]);

  return {
    player: {
      gameNickname: player.gameNickname,
      campId: player.campId,
      area: player.area,
      currentRank: player.currentRank,
      currentStars: player.currentStars,
      rankScore: player.rankScore,
      seasonGames: player.seasonGames,
      seasonWins: player.seasonWins,
      winRate: player.seasonGames
        ? Math.round((player.seasonWins / player.seasonGames) * 1000) / 10
        : 0,
      mvpCount: player.mvpCount,
      goldCount: player.goldCount,
      lastSyncAt: player.lastSyncAt,
      lastSyncError: player.lastSyncError,
      queryCount: player.queryCount,
    },
    matches,
    total,
    page,
    pageSize,
    heroStats: player.heroStats.map((h) => ({
      ...h,
      winRate: h.games ? Math.round((h.wins / h.games) * 1000) / 10 : 0,
      avgKda:
        h.deaths === 0
          ? h.kills + h.assists
          : Math.round(((h.kills + h.assists) / h.deaths) * 100) / 100,
      avgScore: h.games ? Math.round((h.totalScore / h.games) * 10) / 10 : 0,
    })),
    rankSeries: rankMatches.map((m) => ({
      t: m.playedAt.toISOString(),
      score: m.rankScore,
      label: m.rankName,
      stars: m.stars,
      result: m.result,
      hero: m.heroName,
    })),
    cooldown: COOLDOWN,
  };
}

export async function autoSyncStalePlayers(limit = 20) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const players = await prisma.player.findMany({
    where: {
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    take: limit,
    orderBy: { lastSyncAt: "asc" },
  });

  const results: { nickname: string; ok: boolean; message: string }[] = [];
  for (const p of players) {
    try {
      await lookupPlayerByNickname(p.gameNickname, { forceRefresh: true });
      results.push({ nickname: p.gameNickname, ok: true, message: "ok" });
    } catch (e) {
      results.push({
        nickname: p.gameNickname,
        ok: false,
        message: e instanceof Error ? e.message : "failed",
      });
    }
  }
  return results;
}
