import { PrismaClient } from "@prisma/client";
import { MockWzryApiClient } from "../src/lib/wzry-api";
import { parseRankScore } from "../src/lib/rank";

const prisma = new PrismaClient();

async function seedPlayer(nickname: string) {
  const client = new MockWzryApiClient();
  const hits = await client.searchByNickname(nickname);
  const hit = hits[0];
  const result = await client.fetchBattles(hit.campId, {
    num: 50,
    nickname,
  });
  result.profile.gameNickname = nickname;

  const rankScore = parseRankScore(
    result.profile.currentRank,
    result.profile.currentStars,
  );

  const peakScore = 1200 + Math.floor(Math.random() * 800);
  const peakRating = 60 + Math.floor(Math.random() * 50); // 0–110
  const rating = 70 + Math.floor(Math.random() * 40); // 0–110
  const tierScore = rankScore; // parseRankScore result above

  const player = await prisma.player.upsert({
    where: { gameNickname: nickname },
    create: {
      gameNickname: nickname,
      campId: result.profile.campId,
      area: result.profile.area || hit.area,
      currentRank: result.profile.currentRank,
      currentStars: result.profile.currentStars,
      tierScore,
      rankScore: rating,
      peakRating,
      peakScore,
      seasonWins: result.profile.seasonWins ?? 0,
      seasonGames: result.profile.seasonGames ?? 0,
      mvpCount: result.profile.mvpCount ?? 0,
      goldCount: result.profile.goldCount ?? 0,
      lastSyncAt: new Date(),
    },
    update: {
      campId: result.profile.campId,
      area: result.profile.area || hit.area,
      currentRank: result.profile.currentRank,
      currentStars: result.profile.currentStars,
      tierScore,
      rankScore: rating,
      peakRating,
      peakScore,
      seasonWins: result.profile.seasonWins ?? 0,
      seasonGames: result.profile.seasonGames ?? 0,
      mvpCount: result.profile.mvpCount ?? 0,
      goldCount: result.profile.goldCount ?? 0,
      lastSyncAt: new Date(),
    },
  });

  await prisma.scoreHistory.deleteMany({ where: { playerId: player.id } });
  await prisma.heroPowerHistory.deleteMany({ where: { playerId: player.id } });
  const now = Date.now();
  const seasonWins = result.profile.seasonWins ?? 0;
  const seasonGames = result.profile.seasonGames ?? 0;
  for (let i = 5; i >= 0; i--) {
    const wr = seasonGames
      ? Math.max(0, Math.min(100, (seasonWins / seasonGames) * 100 - i * 1.5 + Math.random() * 2))
      : 50;
    await prisma.scoreHistory.create({
      data: {
        playerId: player.id,
        recordedAt: new Date(now - i * 24 * 60 * 60 * 1000),
        rankScore: Math.max(0, Math.min(110, rating - i * 2 + Math.floor(Math.random() * 3))),
        peakRating: Math.max(0, Math.min(110, peakRating - i * 2 + Math.floor(Math.random() * 3))),
        peakScore: Math.max(0, peakScore - i * 20 + Math.floor(Math.random() * 15)),
        winRate: Math.round(wr * 10) / 10,
        source: i === 0 ? "manual" : "sync",
      },
    });
  }

  await prisma.match.deleteMany({ where: { playerId: player.id } });
  await prisma.heroStat.deleteMany({ where: { playerId: player.id } });

  for (const m of result.matches) {
    await prisma.match.create({
      data: {
        playerId: player.id,
        externalId: m.externalId,
        playedAt: m.playedAt,
        mode: m.mode,
        modeName: m.modeName,
        heroId: m.heroId,
        heroName: m.heroName,
        result: m.result,
        kills: m.kills,
        deaths: m.deaths,
        assists: m.assists,
        score: m.score,
        evaluate: m.evaluate,
        durationSec: m.durationSec,
        rankName: m.rankName,
        stars: m.stars,
        rankScore:
          m.rankName != null ? parseRankScore(m.rankName, m.stars ?? 0) : undefined,
        mvp: m.mvp ?? false,
        gold: m.gold ?? false,
        economy: m.economy,
        damage: m.damage,
      },
    });
  }

  const map = new Map<
    string,
    {
      games: number;
      wins: number;
      kills: number;
      deaths: number;
      assists: number;
      totalScore: number;
      heroId?: string;
    }
  >();
  for (const m of result.matches) {
    const cur = map.get(m.heroName) || {
      games: 0,
      wins: 0,
      kills: 0,
      deaths: 0,
      assists: 0,
      totalScore: 0,
      heroId: m.heroId,
    };
    cur.games++;
    if (m.result === "win") cur.wins++;
    cur.kills += m.kills;
    cur.deaths += m.deaths;
    cur.assists += m.assists;
    cur.totalScore += m.score ?? 0;
    map.set(m.heroName, cur);
  }
  await prisma.heroStat.createMany({
    data: [...map.entries()].map(([heroName, s]) => ({
      playerId: player.id,
      heroName,
      heroId: s.heroId,
      combatPower: 6000 + Math.floor(Math.random() * 5000),
      games: s.games,
      wins: s.wins,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      totalScore: s.totalScore,
    })),
  });

  const heroStats = await prisma.heroStat.findMany({ where: { playerId: player.id } });
  for (const hs of heroStats.slice(0, 3)) {
    for (let i = 4; i >= 0; i--) {
      await prisma.heroPowerHistory.create({
        data: {
          playerId: player.id,
          heroName: hs.heroName,
          heroId: hs.heroId,
          recordedAt: new Date(now - i * 24 * 60 * 60 * 1000),
          combatPower: Math.max(
            1000,
            hs.combatPower - i * 50 + Math.floor(Math.random() * 40),
          ),
          source: i === 0 ? "manual" : "sync",
        },
      });
    }
  }

  console.log(`Seeded player: ${nickname}`);
}

async function main() {
  // 重建库表后写入演示玩家
  await seedPlayer("峡谷旅人");
  await seedPlayer("边路霸主");
  await seedPlayer("中路法神");
  console.log("Done. Open / and search by 王者名称.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
