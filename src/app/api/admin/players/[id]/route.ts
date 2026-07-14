import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { parseRankScore } from "@/lib/rank";
import { recordScoreSnapshot } from "@/lib/score-history";
import { RATING_MAX, RATING_MIN, clampRating, clampWinRate } from "@/lib/rating";

const updateSchema = z.object({
  gameNickname: z.string().trim().min(1).optional(),
  campId: z.string().trim().min(1).optional(),
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

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const player = await prisma.player.findUnique({
      where: { id },
      include: {
        scoreHistories: { orderBy: { recordedAt: "desc" }, take: 100 },
        heroStats: { orderBy: [{ combatPower: "desc" }, { games: "desc" }] },
        heroPowerHistories: {
          orderBy: { recordedAt: "desc" },
          take: 200,
        },
        _count: { select: { matches: true } },
      },
    });
    if (!player) return jsonError("玩家不存在", 404);
    return jsonOk({ player });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = updateSchema.parse(await req.json());

    const existing = await prisma.player.findUnique({ where: { id } });
    if (!existing) return jsonError("玩家不存在", 404);

    if (body.gameNickname && body.gameNickname !== existing.gameNickname) {
      const clash = await prisma.player.findUnique({
        where: { gameNickname: body.gameNickname },
      });
      if (clash) return jsonError("该王者名称已被占用", 409);
    }

    if (body.campId && body.campId !== existing.campId) {
      const clash = await prisma.player.findUnique({
        where: { campId: body.campId },
      });
      if (clash) return jsonError("该营地 ID 已被占用", 409);
    }

    const nextRank = body.currentRank !== undefined ? body.currentRank : existing.currentRank;
    const nextStars =
      body.currentStars !== undefined ? body.currentStars : existing.currentStars;
    const tierScore =
      body.currentRank !== undefined || body.currentStars !== undefined
        ? parseRankScore(nextRank, nextStars)
        : undefined;
    const rankScore =
      body.rankScore !== undefined ? clampRating(body.rankScore) : undefined;
    const peakRating =
      body.peakRating !== undefined ? clampRating(body.peakRating) : undefined;

    const player = await prisma.player.update({
      where: { id },
      data: {
        ...(body.gameNickname ? { gameNickname: body.gameNickname } : {}),
        ...(body.campId ? { campId: body.campId } : {}),
        ...(body.area ? { area: body.area } : {}),
        ...(body.currentRank !== undefined ? { currentRank: body.currentRank } : {}),
        ...(body.currentStars !== undefined ? { currentStars: body.currentStars } : {}),
        ...(tierScore !== undefined ? { tierScore } : {}),
        ...(rankScore !== undefined ? { rankScore } : {}),
        ...(peakRating !== undefined ? { peakRating } : {}),
        ...(body.peakScore !== undefined ? { peakScore: body.peakScore } : {}),
        ...(body.seasonWins !== undefined ? { seasonWins: body.seasonWins } : {}),
        ...(body.seasonGames !== undefined ? { seasonGames: body.seasonGames } : {}),
        ...(body.mvpCount !== undefined ? { mvpCount: body.mvpCount } : {}),
        ...(body.goldCount !== undefined ? { goldCount: body.goldCount } : {}),
      },
    });

    const scoreChanged =
      (rankScore !== undefined && rankScore !== existing.rankScore) ||
      (peakRating !== undefined && peakRating !== existing.peakRating) ||
      (body.peakScore !== undefined && body.peakScore !== existing.peakScore) ||
      (body.seasonWins !== undefined && body.seasonWins !== existing.seasonWins) ||
      (body.seasonGames !== undefined && body.seasonGames !== existing.seasonGames);

    if (body.recordHistory !== false && scoreChanged) {
      await recordScoreSnapshot(player.id, {
        rankScore: player.rankScore || null,
        peakRating: player.peakRating || null,
        peakScore: player.peakScore || null,
        winRate: player.seasonGames
          ? clampWinRate((player.seasonWins / player.seasonGames) * 100)
          : null,
        source: "manual",
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
        note: body.note,
      });
    }

    return jsonOk({ player });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const existing = await prisma.player.findUnique({ where: { id } });
    if (!existing) return jsonError("玩家不存在", 404);
    await prisma.player.delete({ where: { id } });
    return jsonOk({ deleted: true, id });
  } catch (err) {
    return handleRouteError(err);
  }
}
