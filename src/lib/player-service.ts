import { prisma } from "./db";
import {
  getWzryApiClient,
  WzryApiError,
  type FetchResult,
  type NormalizedMatch,
} from "./wzry-api";
import { parseRankScore } from "./rank";
import { clampRating } from "./rating";
import { recordHeroPowerSnapshot, recordScoreSnapshot } from "./score-history";
import { CampApiError, CAMP_BATTLE_SYNC_MAX_MATCHES } from "./camp/camp-api";
import { enrichMatchesWithBattleDetail } from "./camp/camp-client";
import { parseEquipsJson } from "./match-equips";

export type SyncStatus = {
  status: "idle" | "running" | "success" | "failed";
  message?: string | null;
  pulled?: number;
};

export type PendingPlayerSync = {
  playerId: string;
  campId: string;
  nickname: string;
  jobId: string;
};

export type LookupResult = {
  data: NonNullable<Awaited<ReturnType<typeof getPlayerDashboard>>>;
  pendingSync?: PendingPlayerSync;
};

/** 进程内防并发：同一玩家同时只跑一个同步任务 */
const syncingPlayerIds = new Set<string>();

const COOLDOWN = Number(process.env.SYNC_COOLDOWN_SECONDS || "300") || 300;
const AUTO_SYNC_INTERVAL_SECONDS = Math.max(
  60,
  Number(process.env.AUTO_SYNC_INTERVAL_SECONDS || "3600") || 3600,
);
const AUTO_SYNC_PLAYER_DELAY_SECONDS = Math.max(
  0,
  Number(process.env.AUTO_SYNC_PLAYER_DELAY_SECONDS || "5") || 5,
);

export function getCooldownSeconds() {
  return COOLDOWN;
}

export function getAutoSyncIntervalSeconds() {
  return AUTO_SYNC_INTERVAL_SECONDS;
}

export function getAutoSyncPlayerDelaySeconds() {
  return AUTO_SYNC_PLAYER_DELAY_SECONDS;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  type HeroAgg = {
    heroId?: string | null;
    heroIcon?: string | null;
    games: number;
    wins: number;
    kills: number;
    deaths: number;
    assists: number;
    totalScore: number;
    scoreGames: number;
    totalEconomy: number;
    totalDurationSec: number;
    totalDamage: number;
    damageGames: number;
    totalTakenDamage: number;
    takenGames: number;
    totalJoinPct: number;
    joinGames: number;
  };
  const emptyAgg = (): HeroAgg => ({
    games: 0,
    wins: 0,
    kills: 0,
    deaths: 0,
    assists: 0,
    totalScore: 0,
    scoreGames: 0,
    totalEconomy: 0,
    totalDurationSec: 0,
    totalDamage: 0,
    damageGames: 0,
    totalTakenDamage: 0,
    takenGames: 0,
    totalJoinPct: 0,
    joinGames: 0,
  });
  const map = new Map<string, HeroAgg>();
  /** 各英雄最近一场有战力数据的值 */
  const latestPower = new Map<string, { power: number; at: number }>();

  for (const m of matches) {
    const cur = map.get(m.heroName) || emptyAgg();
    cur.heroId = m.heroId ?? cur.heroId;
    cur.heroIcon = m.heroIcon ?? cur.heroIcon;
    cur.games += 1;
    if (m.result === "win") cur.wins += 1;
    cur.kills += m.kills;
    cur.deaths += m.deaths;
    cur.assists += m.assists;
    if (m.score != null) {
      cur.totalScore += m.score;
      cur.scoreGames += 1;
    }
    if (m.economy != null && m.durationSec != null && m.durationSec > 0) {
      cur.totalEconomy += m.economy;
      cur.totalDurationSec += m.durationSec;
    }
    if (m.damage != null) {
      cur.totalDamage += m.damage;
      cur.damageGames += 1;
    }
    if (m.takenDamage != null) {
      cur.totalTakenDamage += m.takenDamage;
      cur.takenGames += 1;
    }
    if (m.joinPct != null) {
      cur.totalJoinPct += m.joinPct;
      cur.joinGames += 1;
    }
    if (m.combatPower != null && m.combatPower > 0) {
      const prev = latestPower.get(m.heroName);
      const at = m.playedAt.getTime();
      if (!prev || at >= prev.at) {
        latestPower.set(m.heroName, { power: m.combatPower, at });
      }
    }
    if (m.heroIcon) cur.heroIcon = m.heroIcon;
    if (m.heroId) cur.heroId = m.heroId;
    map.set(m.heroName, cur);
  }

  await prisma.heroStat.deleteMany({ where: { playerId } });
  const rows = [...map.entries()].map(([heroName, s]) => ({
    playerId,
    heroName,
    heroId: s.heroId || undefined,
    heroIcon: s.heroIcon || undefined,
    combatPower: latestPower.get(heroName)?.power ?? powerMap.get(heroName) ?? 0,
    games: s.games,
    wins: s.wins,
    kills: s.kills,
    deaths: s.deaths,
    assists: s.assists,
    totalScore: s.totalScore,
    scoreGames: s.scoreGames,
    totalEconomy: s.totalEconomy,
    totalDurationSec: s.totalDurationSec,
    totalDamage: s.totalDamage,
    damageGames: s.damageGames,
    totalTakenDamage: s.totalTakenDamage,
    takenGames: s.takenGames,
    totalJoinPct: s.totalJoinPct,
    joinGames: s.joinGames,
  }));

  // 保留仅有战力、暂无对局的英雄
  for (const [heroName, combatPower] of powerMap) {
    if (!map.has(heroName) && combatPower > 0) {
      rows.push({
        playerId,
        heroName,
        heroId: undefined,
        heroIcon: undefined,
        combatPower,
        games: 0,
        wins: 0,
        kills: 0,
        deaths: 0,
        assists: 0,
        totalScore: 0,
        scoreGames: 0,
        totalEconomy: 0,
        totalDurationSec: 0,
        totalDamage: 0,
        damageGames: 0,
        totalTakenDamage: 0,
        takenGames: 0,
        totalJoinPct: 0,
        joinGames: 0,
      });
    }
  }

  if (rows.length) {
    await prisma.heroStat.createMany({ data: rows });
  }
}

/** 用对局战力重建 sync 来源的英雄战力历史（保留手动录入） */
async function refreshHeroPowerHistoryFromMatches(playerId: string) {
  const groups = await prisma.match.groupBy({
    by: ["heroName"],
    where: { playerId, combatPower: { gt: 0 } },
  });

  for (const { heroName } of groups) {
    const matches = await prisma.match.findMany({
      where: { playerId, heroName, combatPower: { gt: 0 } },
      orderBy: { playedAt: "asc" },
      select: { combatPower: true, playedAt: true, heroId: true },
    });

    let prev: number | null = null;
    const data: Array<{
      playerId: string;
      heroName: string;
      heroId?: string;
      combatPower: number;
      recordedAt: Date;
      source: "sync";
    }> = [];
    for (const m of matches) {
      if (m.combatPower == null || m.combatPower === prev) continue;
      prev = m.combatPower;
      data.push({
        playerId,
        heroName,
        heroId: m.heroId ?? undefined,
        combatPower: m.combatPower,
        recordedAt: m.playedAt,
        source: "sync",
      });
    }

    await prisma.heroPowerHistory.deleteMany({
      where: { playerId, heroName, source: "sync" },
    });
    if (data.length) {
      await prisma.heroPowerHistory.createMany({ data });
    }
  }
}

async function persistMatchDetailUpdates(
  playerId: string,
  matches: NormalizedMatch[],
) {
  for (const m of matches) {
    const hasDetail =
      (m.equips && m.equips.length > 0) ||
      m.economy != null ||
      m.damage != null ||
      m.takenDamage != null ||
      m.joinPct != null ||
      m.combatPower != null;
    if (!hasDetail) continue;

    await prisma.match.updateMany({
      where: { playerId, externalId: m.externalId },
      data: {
        ...(m.economy != null ? { economy: m.economy } : {}),
        ...(m.economyPct != null ? { economyPct: m.economyPct } : {}),
        ...(m.damage != null ? { damage: m.damage } : {}),
        ...(m.damagePct != null ? { damagePct: m.damagePct } : {}),
        ...(m.takenDamage != null ? { takenDamage: m.takenDamage } : {}),
        ...(m.takenDamagePct != null ? { takenDamagePct: m.takenDamagePct } : {}),
        ...(m.joinPct != null ? { joinPct: m.joinPct } : {}),
        ...(m.combatPower != null ? { combatPower: m.combatPower } : {}),
        ...(m.equips?.length ? { equipsJson: JSON.stringify(m.equips) } : {}),
      },
    });
  }
}

async function getSyncStatusForPlayer(playerId: string): Promise<SyncStatus> {
  const job = await prisma.syncJob.findFirst({
    where: { playerId },
    orderBy: { startedAt: "desc" },
  });
  if (!job) return { status: "idle" };
  if (job.status === "running") {
    return { status: "running", message: job.message, pulled: job.pulled };
  }
  if (job.status === "failed") {
    return { status: "failed", message: job.message, pulled: job.pulled };
  }
  return { status: "success", message: job.message, pulled: job.pulled };
}

async function persistFetchResult(
  playerId: string,
  nickname: string,
  result: FetchResult,
) {
  const tierScore = parseRankScore(result.profile.currentRank, result.profile.currentStars);
  const seasonWins = result.profile.seasonWins;
  const seasonGames = result.profile.seasonGames;
  const winRate =
    seasonGames != null && seasonGames > 0 && seasonWins != null
      ? (seasonWins / seasonGames) * 100
      : null;

  let updated = await prisma.player.update({
    where: { id: playerId },
    data: {
      gameNickname: nickname,
      campId: result.profile.campId,
      area: result.profile.area || "wechat",
      gameAvatarUrl: result.profile.gameAvatarUrl,
      currentRank: result.profile.currentRank,
      currentStars: result.profile.currentStars,
      tierScore,
      // 增量时未带赛季字段则保留原值；评分来自营地赛季页 averageScore
      ...(seasonWins != null ? { seasonWins } : {}),
      ...(seasonGames != null ? { seasonGames } : {}),
      ...(result.profile.rankScore != null
        ? { rankScore: clampRating(result.profile.rankScore) }
        : {}),
      ...(result.profile.peakRating != null
        ? { peakRating: clampRating(result.profile.peakRating) }
        : {}),
      ...(result.profile.peakScore != null
        ? { peakScore: result.profile.peakScore }
        : {}),
      ...(result.profile.mvpCount != null ? { mvpCount: result.profile.mvpCount } : {}),
      ...(result.profile.goldCount != null ? { goldCount: result.profile.goldCount } : {}),
      lastSyncAt: new Date(),
      lastSyncError: null,
      queryCount: { increment: 1 },
    },
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
        peakScore: m.peakScore ?? null,
        peakDelta: m.peakDelta ?? null,
        mvp: m.mvp ?? false,
        gold: m.gold ?? false,
        medal: m.medal,
        medalIcon: m.medalIcon,
        mvpType: m.mvpType,
        mvpIcon: m.mvpIcon,
        side: m.side,
        economy: m.economy,
        economyPct: m.economyPct,
        damage: m.damage,
        damagePct: m.damagePct,
        takenDamage: m.takenDamage,
        takenDamagePct: m.takenDamagePct,
        joinPct: m.joinPct,
        combatPower: m.combatPower,
        equipsJson: m.equips?.length ? JSON.stringify(m.equips) : undefined,
        rawJson: m.rawJson,
      },
      update: {
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
        peakScore: m.peakScore ?? null,
        peakDelta: m.peakDelta ?? null,
        mvp: m.mvp ?? false,
        gold: m.gold ?? false,
        medal: m.medal,
        medalIcon: m.medalIcon,
        mvpType: m.mvpType,
        mvpIcon: m.mvpIcon,
        side: m.side,
        ...(m.economy != null ? { economy: m.economy } : {}),
        ...(m.economyPct != null ? { economyPct: m.economyPct } : {}),
        ...(m.damage != null ? { damage: m.damage } : {}),
        ...(m.damagePct != null ? { damagePct: m.damagePct } : {}),
        ...(m.takenDamage != null ? { takenDamage: m.takenDamage } : {}),
        ...(m.takenDamagePct != null ? { takenDamagePct: m.takenDamagePct } : {}),
        ...(m.joinPct != null ? { joinPct: m.joinPct } : {}),
        ...(m.combatPower != null ? { combatPower: m.combatPower } : {}),
        ...(m.equips?.length ? { equipsJson: JSON.stringify(m.equips) } : {}),
        rawJson: m.rawJson,
      },
    });
    pulled++;
  }

  const latestPeakMatch = await prisma.match.findFirst({
    where: { playerId, mode: "peak", peakScore: { not: null } },
    orderBy: { playedAt: "desc" },
    select: { peakScore: true },
  });
  const currentPeakScore =
    latestPeakMatch?.peakScore != null && latestPeakMatch.peakScore > 0
      ? latestPeakMatch.peakScore
      : (result.profile.peakScore ?? 1200);
  if (updated.peakScore !== currentPeakScore) {
    updated = await prisma.player.update({
      where: { id: playerId },
      data: { peakScore: currentPeakScore },
    });
  }

  await recordScoreSnapshot(playerId, {
    rankScore: updated.rankScore || null,
    peakRating: updated.peakRating || null,
    peakScore: updated.peakScore || null,
    winRate:
      winRate != null
        ? winRate
        : updated.seasonGames
          ? (updated.seasonWins / updated.seasonGames) * 100
          : 0,
    source: "sync",
  });

  await trimMatchesToLatest(playerId, CAMP_BATTLE_SYNC_MAX_MATCHES);
  await recomputeRankDeltas(playerId);

  const prevPowers = await prisma.heroStat.findMany({
    where: { playerId },
    select: { heroName: true, combatPower: true, heroId: true },
  });
  const prevPowerMap = new Map(prevPowers.map((h) => [h.heroName, h.combatPower]));
  await recomputeHeroStats(playerId);

  const nextPowers = await prisma.heroStat.findMany({
    where: { playerId, combatPower: { gt: 0 } },
    select: { heroName: true, combatPower: true, heroId: true },
  });
  for (const h of nextPowers) {
    const prev = prevPowerMap.get(h.heroName) ?? 0;
    if (h.combatPower !== prev) {
      await recordHeroPowerSnapshot(playerId, {
        heroName: h.heroName,
        heroId: h.heroId,
        combatPower: h.combatPower,
        source: "sync",
        applyToStat: false,
      });
    }
  }

  return pulled;
}

/** 只保留最近 keep 场，超出的旧对局删除 */
async function trimMatchesToLatest(playerId: string, keep: number) {
  const latest = await prisma.match.findMany({
    where: { playerId },
    orderBy: { playedAt: "desc" },
    take: keep,
    select: { id: true },
  });
  if (latest.length < keep) return;
  await prisma.match.deleteMany({
    where: {
      playerId,
      id: { notIn: latest.map((m) => m.id) },
    },
  });
}

/** 按相邻排位场次的 rankScore 差写入 rankDelta（约等于星数变化） */
async function recomputeRankDeltas(playerId: string) {
  const ranked = await prisma.match.findMany({
    where: { playerId, mode: "ranked", rankScore: { not: null } },
    orderBy: { playedAt: "asc" },
    select: { id: true, rankScore: true },
  });

  for (let i = 0; i < ranked.length; i++) {
    const delta =
      i === 0 ? null : (ranked[i].rankScore as number) - (ranked[i - 1].rankScore as number);
    await prisma.match.update({
      where: { id: ranked[i].id },
      data: { rankDelta: delta },
    });
  }
}

/**
 * 后台两阶段同步：先入库战绩列表（快），再补全对局详情（慢）。
 * 同一玩家并发调用会复用已有 running job。
 */
export async function startPlayerSync(pending: PendingPlayerSync) {
  if (syncingPlayerIds.has(pending.playerId)) return;

  const job = await prisma.syncJob.findUnique({ where: { id: pending.jobId } });
  if (!job || job.playerId !== pending.playerId || job.status !== "running") {
    return;
  }

  syncingPlayerIds.add(pending.playerId);

  const client = getWzryApiClient();
  const jobId = pending.jobId;

  try {
    // 预检：未开放战绩查询则直接失败，避免继续拉列表/详情
    if (client.assertBattleQueryAllowed) {
      await prisma.syncJob.update({
        where: { id: jobId },
        data: { message: "正在检查查询权限…" },
      });
      await client.assertBattleQueryAllowed(pending.campId);
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: { message: "正在同步战绩列表…" },
    });

    const matchCount = await prisma.match.count({
      where: { playerId: pending.playerId },
    });
    const seeded = matchCount >= CAMP_BATTLE_SYNC_MAX_MATCHES;
    const knownExternalIds = seeded
      ? (
          await prisma.match.findMany({
            where: { playerId: pending.playerId },
            orderBy: { playedAt: "desc" },
            take: CAMP_BATTLE_SYNC_MAX_MATCHES,
            select: { externalId: true },
          })
        ).map((m) => m.externalId)
      : undefined;

    // 阶段 1：列表入库（跳过详情）
    const result = await client.fetchBattles(pending.campId, {
      nickname: pending.nickname,
      knownExternalIds,
      enrichDetails: false,
    });
    result.profile.gameNickname = pending.nickname;
    const pulled = await persistFetchResult(
      pending.playerId,
      pending.nickname,
      result,
    );

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        pulled,
        message: seeded
          ? `列表已同步 ${pulled} 场新对局，正在补全详情…`
          : `列表已同步 ${pulled} 场，正在补全详情…`,
      },
    });

    // 阶段 2：逐场补全详情并立刻写库，前端轮询可逐场看到出装/经济/伤害/战力
    let detailNote = "";
    if (result.roleId) {
      try {
        // 本批新对局 + 库中装备为空或战力为空的对局，均需重拉详情
        const recentRows = await prisma.match.findMany({
          where: {
            playerId: pending.playerId,
            rawJson: { not: null },
          },
          orderBy: { playedAt: "desc" },
          take: CAMP_BATTLE_SYNC_MAX_MATCHES,
          select: {
            externalId: true,
            rawJson: true,
            heroName: true,
            playedAt: true,
            mode: true,
            modeName: true,
            result: true,
            kills: true,
            deaths: true,
            assists: true,
            combatPower: true,
            equipsJson: true,
          },
        });
        const incompleteRows = recentRows.filter(
          (row) =>
            row.combatPower == null ||
            parseEquipsJson(row.equipsJson).length === 0,
        );
        const byExternal = new Map(
          result.matches.map((m) => [m.externalId, m] as const),
        );
        for (const row of incompleteRows) {
          if (byExternal.has(row.externalId)) continue;
          byExternal.set(row.externalId, {
            externalId: row.externalId,
            playedAt: row.playedAt,
            mode: row.mode as NormalizedMatch["mode"],
            modeName: row.modeName ?? "未知模式",
            heroName: row.heroName,
            result: row.result as NormalizedMatch["result"],
            kills: row.kills,
            deaths: row.deaths,
            assists: row.assists,
            rawJson: row.rawJson ?? undefined,
          });
        }
        const toEnrich = [...byExternal.values()];

        if (toEnrich.length) {
          await enrichMatchesWithBattleDetail(toEnrich, result.roleId, {
            onEnriched: async (match, progress) => {
              await persistMatchDetailUpdates(pending.playerId, [match]);
              await prisma.syncJob.update({
                where: { id: jobId },
                data: {
                  message: `正在补全详情 ${progress.fetched}/${progress.target}…`,
                },
              });
            },
          });

          await recomputeHeroStats(pending.playerId);
          await refreshHeroPowerHistoryFromMatches(pending.playerId);
        }
      } catch (err) {
        // 未开放查询 / 登录失效 / 频控：整次同步失败，不再假装成功
        if (
          (err instanceof CampApiError &&
            (err.code === "hidden" ||
              err.code === "auth" ||
              err.code === "rate_limit")) ||
          (err instanceof WzryApiError &&
            (err.code === "hidden" ||
              err.code === "config" ||
              err.code === "rate_limit"))
        ) {
          throw err;
        }
        detailNote = "（详情补全未完成）";
      }
    }

    await prisma.syncJob.update({
      where: { id: jobId },
      data: {
        status: "success",
        pulled,
        finishedAt: new Date(),
        message:
          (seeded
            ? `增量同步 ${pulled} 场新对局（保留最近 ${CAMP_BATTLE_SYNC_MAX_MATCHES} 条）`
            : `全量同步 ${pulled} 场（8 页 / 最多 ${CAMP_BATTLE_SYNC_MAX_MATCHES} 条）`) +
          detailNote,
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
      where: { id: pending.playerId },
      data: { lastSyncError: message, lastSyncAt: new Date() },
    });
    await prisma.syncJob.update({
      where: { id: jobId },
      data: { status: "failed", message, finishedAt: new Date() },
    });
    throw err;
  } finally {
    syncingPlayerIds.delete(pending.playerId);
  }
}

/** 按营地 ID 查询：快速返回看板，需要同步时返回 pendingSync 供调用方调度 */
export async function lookupPlayerByCampId(
  campIdRaw: string,
  opts?: { forceRefresh?: boolean; ignoreCooldown?: boolean },
): Promise<LookupResult> {
  const campId = campIdRaw.trim();
  if (!/^\d{5,15}$/.test(campId)) {
    throw new PlayerServiceError("营地 ID 应为 5–15 位数字", 400);
  }

  const client = getWzryApiClient();
  let hits;
  try {
    hits = await client.searchByNickname(campId);
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

  const hit = hits[0];
  const displayName = hit.gameNickname;

  let player = await prisma.player.findUnique({ where: { campId: hit.campId } });
  if (!player) {
    player = await prisma.player.findUnique({ where: { gameNickname: displayName } });
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
  } else {
    const patch: {
      gameNickname?: string;
      campId?: string;
      area?: string;
      currentRank?: string;
      currentStars?: number;
      tierScore?: number;
    } = {};
    if (player.gameNickname !== displayName) patch.gameNickname = displayName;
    if (player.campId !== hit.campId) patch.campId = hit.campId;
    if (hit.area && player.area !== hit.area) patch.area = hit.area;
    if (hit.currentRank && player.currentRank !== hit.currentRank) {
      patch.currentRank = hit.currentRank;
      patch.currentStars = hit.currentStars ?? 0;
      patch.tierScore = parseRankScore(hit.currentRank, hit.currentStars ?? 0);
    }
    if (Object.keys(patch).length) {
      player = await prisma.player.update({ where: { id: player.id }, data: patch });
    }
  }

  let pendingSync: PendingPlayerSync | undefined;

  if (needRefresh) {
    if (opts?.forceRefresh && !opts.ignoreCooldown && player.lastSyncAt) {
      const elapsed = (Date.now() - player.lastSyncAt.getTime()) / 1000;
      if (elapsed < COOLDOWN) {
        const wait = Math.ceil(COOLDOWN - elapsed);
        throw new PlayerServiceError(`刷新冷却中，请 ${wait} 秒后再试`, 429, wait);
      }
    }

    const running = await prisma.syncJob.findFirst({
      where: { playerId: player.id, status: "running" },
      orderBy: { startedAt: "desc" },
    });

    if (running) {
      pendingSync = {
        playerId: player.id,
        campId: hit.campId,
        nickname: displayName,
        jobId: running.id,
      };
    } else {
      const job = await prisma.syncJob.create({
        data: {
          playerId: player.id,
          status: "running",
          message: "正在同步战绩…",
        },
      });
      pendingSync = {
        playerId: player.id,
        campId: hit.campId,
        nickname: displayName,
        jobId: job.id,
      };
    }
  } else {
    await prisma.player.update({
      where: { id: player.id },
      data: { queryCount: { increment: 1 } },
    });
  }

  const data = await getPlayerDashboard(displayName);
  if (!data) throw new PlayerServiceError("未找到该玩家", 404);

  return { data, pendingSync };
}

/** @deprecated 保留兼容；新逻辑请用 lookupPlayerByCampId */
export async function lookupPlayerByNickname(
  nicknameRaw: string,
  opts?: { forceRefresh?: boolean },
): Promise<LookupResult> {
  const nickname = nicknameRaw.trim();
  if (!nickname) throw new PlayerServiceError("请输入王者名称", 400);

  // 纯数字当作营地 ID
  if (/^\d{5,15}$/.test(nickname)) {
    return lookupPlayerByCampId(nickname, opts);
  }

  const existing = await prisma.player.findUnique({ where: { gameNickname: nickname } });
  if (!existing) {
    throw new PlayerServiceError("请使用营地 ID 查询；已入库玩家可从排行榜进入", 400);
  }
  return lookupPlayerByCampId(
    existing.campId.includes(":") ? existing.campId.split(":")[0] : existing.campId,
    opts,
  );
}

export async function getPlayerDashboard(
  nickname: string,
  query?: {
    range?: string;
    mode?: string;
    result?: string;
    side?: string;
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
  const side = query?.side || "all";
  const hero = query?.hero || "";
  const page = Math.max(1, query?.page || 1);
  const pageSize = 100;

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
    ...(side === "blue" || side === "red" ? { side } : {}),
    ...(hero ? { heroName: hero } : {}),
  };

  const [total, wins, kdaAgg, matches, rankMatches, peakMatches, likeCount, syncStatus] =
    await Promise.all([
    prisma.match.count({ where }),
    prisma.match.count({ where: { ...where, result: "win" } }),
    prisma.match.aggregate({
      where,
      _sum: { kills: true, deaths: true, assists: true, score: true },
      _count: { score: true },
    }),
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
    prisma.match.findMany({
      where: {
        playerId: player.id,
        mode: "peak",
        peakScore: { not: null },
        ...(since ? { playedAt: { gte: since } } : {}),
      },
      orderBy: { playedAt: "asc" },
      select: {
        playedAt: true,
        peakScore: true,
        result: true,
        heroName: true,
      },
    }),
    prisma.playerLike.count({ where: { playerId: player.id } }),
    getSyncStatusForPlayer(player.id),
  ]);

  const sumKills = kdaAgg._sum.kills ?? 0;
  const sumDeaths = kdaAgg._sum.deaths ?? 0;
  const sumAssists = kdaAgg._sum.assists ?? 0;
  const matchAvgKda = total
    ? sumDeaths === 0
      ? Math.round((sumKills + sumAssists) * 100) / 100
      : Math.round(((sumKills + sumAssists) / sumDeaths) * 100) / 100
    : 0;
  const scoredGames = kdaAgg._count.score || 0;
  const matchAvgScore =
    scoredGames && kdaAgg._sum.score != null
      ? Math.round((kdaAgg._sum.score / scoredGames) * 10) / 10
      : 0;

  return {
    player: {
      gameNickname: player.gameNickname,
      campId: player.campId,
      area: player.area,
      gameAvatarUrl: player.gameAvatarUrl,
      currentRank: player.currentRank,
      currentStars: player.currentStars,
      rankScore: player.rankScore,
      peakRating: player.peakRating,
      peakScore: player.peakScore,
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
      likeCount,
    },
    matches: matches.map(({ equipsJson, rawJson: _rawJson, ...m }) => ({
      ...m,
      equips: parseEquipsJson(equipsJson),
    })),
    total,
    wins,
    matchWinRate: total ? Math.round((wins / total) * 1000) / 10 : 0,
    matchAvgKda,
    matchAvgScore,
    page,
    pageSize,
    heroStats: player.heroStats.map((h) => {
      const scoreGames = h.scoreGames || 0;
      const avgScore = scoreGames
        ? Math.round((h.totalScore / scoreGames) * 10) / 10
        : h.games
          ? Math.round((h.totalScore / h.games) * 10) / 10
          : 0;
      const avgEconomyPerMin =
        h.totalDurationSec > 0
          ? Math.round((h.totalEconomy / (h.totalDurationSec / 60)) * 10) / 10
          : null;
      const avgDamage = h.damageGames
        ? Math.round(h.totalDamage / h.damageGames)
        : null;
      const avgTakenDamage = h.takenGames
        ? Math.round(h.totalTakenDamage / h.takenGames)
        : null;
      const avgJoinPct = h.joinGames
        ? Math.round((h.totalJoinPct / h.joinGames) * 10) / 10
        : null;
      const avgKills = h.games ? Math.round((h.kills / h.games) * 10) / 10 : 0;
      const avgDeaths = h.games ? Math.round((h.deaths / h.games) * 10) / 10 : 0;
      const avgAssists = h.games ? Math.round((h.assists / h.games) * 10) / 10 : 0;
      return {
        heroName: h.heroName,
        heroIcon: h.heroIcon,
        combatPower: h.combatPower > 0 ? h.combatPower : null,
        games: h.games,
        wins: h.wins,
        winRate: h.games ? Math.round((h.wins / h.games) * 1000) / 10 : 0,
        avgKda:
          h.deaths === 0
            ? h.kills + h.assists
            : Math.round(((h.kills + h.assists) / h.deaths) * 100) / 100,
        avgKills,
        avgDeaths,
        avgAssists,
        avgScore,
        avgEconomyPerMin,
        avgDamage,
        avgTakenDamage,
        avgJoinPct,
      };
    }),
    rankSeries: rankMatches.map((m) => ({
      t: m.playedAt.toISOString(),
      score: m.rankScore,
      label: m.rankName,
      stars: m.stars,
      result: m.result,
      hero: m.heroName,
    })),
    peakSeries: peakMatches.map((m) => ({
      t: m.playedAt.toISOString(),
      value: m.peakScore as number,
      result: m.result,
      hero: m.heroName,
    })),
    cooldown: COOLDOWN,
    syncStatus,
  };
}

/**
 * 自动同步到期玩家。默认每轮同步全部到期玩家，并在玩家之间等待，
 * 避免连续请求触发营地频控。
 */
export async function autoSyncStalePlayers(limit?: number) {
  const take =
    Number.isFinite(limit) && limit != null && limit > 0 ? Math.max(1, limit) : undefined;
  const cutoff = new Date(Date.now() - AUTO_SYNC_INTERVAL_SECONDS * 1000);
  const players = await prisma.player.findMany({
    where: {
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }],
    },
    ...(take ? { take } : {}),
    orderBy: { lastSyncAt: "asc" },
  });

  return syncPlayers(players);
}

export async function syncAllPlayers() {
  const players = await prisma.player.findMany({
    orderBy: { lastSyncAt: "asc" },
  });

  return syncPlayers(players, { ignoreCooldown: true });
}

/** 管理后台：按玩家 ID 强制同步，忽略冷却 */
export async function syncPlayerById(playerId: string) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, gameNickname: true, campId: true },
  });
  if (!player) {
    throw new PlayerServiceError("玩家不存在", 404);
  }
  const campId = player.campId.includes(":")
    ? player.campId.split(":")[0]
    : player.campId;
  if (!/^\d{5,15}$/.test(campId)) {
    throw new PlayerServiceError("该玩家缺少有效营地 ID，无法同步", 400);
  }
  const { pendingSync } = await lookupPlayerByCampId(campId, {
    forceRefresh: true,
    ignoreCooldown: true,
  });
  if (pendingSync) {
    await startPlayerSync(pendingSync);
  }
  return { nickname: player.gameNickname, campId };
}

async function syncPlayers(
  players: Array<{ gameNickname: string; campId: string }>,
  opts?: { ignoreCooldown?: boolean },
) {
  const results: { nickname: string; ok: boolean; message: string }[] = [];
  for (let i = 0; i < players.length; i++) {
    const p = players[i];
    try {
      const campId = p.campId.includes(":") ? p.campId.split(":")[0] : p.campId;
      const { pendingSync } = await lookupPlayerByCampId(campId, {
        forceRefresh: true,
        ignoreCooldown: opts?.ignoreCooldown,
      });
      if (pendingSync) {
        await startPlayerSync(pendingSync);
      }
      results.push({ nickname: p.gameNickname, ok: true, message: "ok" });
    } catch (e) {
      results.push({
        nickname: p.gameNickname,
        ok: false,
        message: e instanceof Error ? e.message : "failed",
      });
    }

    if (i < players.length - 1 && AUTO_SYNC_PLAYER_DELAY_SECONDS > 0) {
      await sleep(AUTO_SYNC_PLAYER_DELAY_SECONDS * 1000);
    }
  }
  return results;
}
