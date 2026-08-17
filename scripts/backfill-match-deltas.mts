import { PrismaClient } from "@prisma/client";
import {
  MAX_PLAUSIBLE_STAR_DELTA,
  parseRankScore,
  rankNameFromCode,
  rankScoreFromCode,
} from "../src/lib/rank";

const prisma = new PrismaClient();

async function backfillPeakDeltas() {
  const matches = await prisma.match.findMany({
    where: { rawJson: { not: null }, mode: "peak" },
    select: { id: true, rawJson: true },
  });

  let updated = 0;
  for (const m of matches) {
    if (!m.rawJson) continue;
    try {
      const raw = JSON.parse(m.rawJson) as Record<string, unknown>;
      const neu = raw.newMasterMatchScore != null ? Number(raw.newMasterMatchScore) : NaN;
      const old = raw.oldMasterMatchScore != null ? Number(raw.oldMasterMatchScore) : NaN;
      if (!Number.isFinite(neu) || !Number.isFinite(old)) continue;
      await prisma.match.update({
        where: { id: m.id },
        data: { peakDelta: neu - old },
      });
      updated += 1;
    } catch {
      // skip bad json
    }
  }
  return updated;
}

async function backfillRankDeltas() {
  const playerIds = await prisma.match.findMany({
    where: { mode: "ranked" },
    distinct: ["playerId"],
    select: { playerId: true },
  });

  let updated = 0;
  for (const { playerId } of playerIds) {
    const ranked = await prisma.match.findMany({
      where: { playerId, mode: "ranked" },
      orderBy: { playedAt: "asc" },
      select: {
        id: true,
        rankName: true,
        stars: true,
        rankCode: true,
        rankScore: true,
        rawJson: true,
      },
    });

    // 分数一律重算：优先 rawJson 里的对局段位代码 roleJob（rankName 是拉取时
    // 的当前段位，不跟随对局），缺代码时才回退段位名+星数
    let prevScore: number | null = null;
    for (let i = 0; i < ranked.length; i++) {
      const cur = ranked[i];

      let rankCode = cur.rankCode;
      if (rankCode == null && cur.rawJson) {
        try {
          const raw = JSON.parse(cur.rawJson) as Record<string, unknown>;
          const parsed = raw.roleJob != null ? Number(raw.roleJob) : NaN;
          if (Number.isFinite(parsed)) rankCode = parsed;
        } catch {
          // skip bad json
        }
      }

      const score =
        rankScoreFromCode(rankCode, cur.stars ?? 0) ??
        (cur.rankName != null ? parseRankScore(cur.rankName, cur.stars ?? 0) : cur.rankScore);
      if (score == null) continue;

      const rawDelta = prevScore == null ? null : score - prevScore;
      // 赛季重置/王者段位继承的掉段不是本场星数变化，按断点置空
      const delta =
        rawDelta != null && Math.abs(rawDelta) > MAX_PLAUSIBLE_STAR_DELTA ? null : rawDelta;
      prevScore = score;

      await prisma.match.update({
        where: { id: cur.id },
        data: {
          rankCode,
          rankName: rankNameFromCode(rankCode) ?? cur.rankName,
          rankScore: score,
          rankDelta: delta,
        },
      });
      updated += 1;
    }
  }
  return updated;
}

async function backfillPlayerTierScores() {
  const players = await prisma.player.findMany({
    select: { id: true, currentRank: true, currentStars: true, tierScore: true },
  });

  let updated = 0;
  for (const p of players) {
    const tierScore = parseRankScore(p.currentRank, p.currentStars ?? 0);
    if (tierScore === p.tierScore) continue;
    await prisma.player.update({
      where: { id: p.id },
      data: { tierScore },
    });
    updated += 1;
  }
  return updated;
}

const peak = await backfillPeakDeltas();
const rank = await backfillRankDeltas();
const tiers = await backfillPlayerTierScores();
console.log(`peakDelta updated: ${peak}, rankDelta updated: ${rank}, tierScore updated: ${tiers}`);
await prisma.$disconnect();
