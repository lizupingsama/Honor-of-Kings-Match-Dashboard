import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseRankScore } from "@/lib/rank";
import { recordScoreSnapshot } from "@/lib/score-history";
import { RATING_MAX, RATING_MIN, clampRating, clampWinRate } from "@/lib/rating";

const createSchema = z.object({
  gameNickname: z.string().trim().min(1, "请输入王者名称"),
  campId: z.string().trim().optional(),
  area: z.enum(["wechat", "qq"]).optional(),
  currentRank: z.string().nullable().optional(),
  currentStars: z.number().int().min(0).optional(),
  rankScore: z.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
  peakRating: z.number().int().min(RATING_MIN).max(RATING_MAX).optional(),
  peakScore: z.number().int().min(0).optional(),
  seasonWins: z.number().int().min(0).optional(),
  seasonGames: z.number().int().min(0).optional(),
  mvpCount: z.number().int().min(0).optional(),
  goldCount: z.number().int().min(0).optional(),
  recordHistory: z.boolean().optional(),
  recordedAt: z.string().datetime().optional(),
  note: z.string().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(200, Number(searchParams.get("limit") || "100"));

    const players = await prisma.player.findMany({
      where: q
        ? {
            OR: [
              { gameNickname: { contains: q } },
              { campId: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      take: limit,
      include: {
        _count: {
          select: {
            matches: true,
            scoreHistories: true,
            heroStats: true,
          },
        },
      },
    });

    return jsonOk({ players });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = createSchema.parse(await req.json());
    const nickname = body.gameNickname.trim();

    const exists = await prisma.player.findUnique({
      where: { gameNickname: nickname },
    });
    if (exists) return jsonError("该王者名称已存在", 409);

    const campId =
      body.campId?.trim() ||
      `manual:${nickname}:${Date.now().toString(36)}`;

    const rankScore =
      body.rankScore != null && body.rankScore > 0
        ? clampRating(body.rankScore)
        : 0;
    const peakRating = clampRating(body.peakRating ?? 0);
    const seasonWins = body.seasonWins ?? 0;
    const seasonGames = body.seasonGames ?? 0;
    const tierScore = parseRankScore(body.currentRank, body.currentStars ?? 0);

    const player = await prisma.player.create({
      data: {
        gameNickname: nickname,
        campId,
        area: body.area || "wechat",
        currentRank: body.currentRank || null,
        currentStars: body.currentStars ?? 0,
        tierScore,
        rankScore,
        peakRating,
        peakScore: body.peakScore ?? 0,
        seasonWins,
        seasonGames,
        mvpCount: body.mvpCount ?? 0,
        goldCount: body.goldCount ?? 0,
        lastSyncAt: new Date(),
      },
    });

    if (body.recordHistory !== false) {
      await recordScoreSnapshot(player.id, {
        rankScore: player.rankScore || null,
        peakRating: player.peakRating || null,
        peakScore: player.peakScore || null,
        winRate: seasonGames ? clampWinRate((seasonWins / seasonGames) * 100) : null,
        source: "manual",
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
        note: body.note,
      });
    }

    return jsonOk({ player }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
