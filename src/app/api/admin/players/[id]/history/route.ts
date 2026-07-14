import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { RATING_MAX, RATING_MIN, clampRating, clampWinRate } from "@/lib/rating";

const historySchema = z.object({
  recordedAt: z.string().datetime().optional(),
  rankScore: z.number().int().min(RATING_MIN).max(RATING_MAX).nullable().optional(),
  peakRating: z.number().int().min(RATING_MIN).max(RATING_MAX).nullable().optional(),
  peakScore: z.number().int().min(0).nullable().optional(),
  winRate: z.number().min(0).max(100).nullable().optional(),
  note: z.string().nullable().optional(),
  applyToPlayer: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = historySchema.parse(await req.json());

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) return jsonError("玩家不存在", 404);

    const rankScore = body.rankScore != null ? clampRating(body.rankScore) : null;
    const peakRating = body.peakRating != null ? clampRating(body.peakRating) : null;
    const peakScore = body.peakScore ?? null;
    const winRate = body.winRate != null ? clampWinRate(body.winRate) : null;

    const hasAny =
      rankScore != null || peakRating != null || peakScore != null || winRate != null;
    if (!hasAny) return jsonError("至少填写一项评分、巅峰分或胜率", 400);

    const history = await prisma.scoreHistory.create({
      data: {
        playerId: id,
        recordedAt: body.recordedAt ? new Date(body.recordedAt) : new Date(),
        rankScore: rankScore ?? undefined,
        peakRating: peakRating ?? undefined,
        peakScore: peakScore ?? undefined,
        winRate: winRate ?? undefined,
        source: "manual",
        note: body.note ?? undefined,
      },
    });

    if (body.applyToPlayer !== false) {
      await prisma.player.update({
        where: { id },
        data: {
          ...(rankScore != null ? { rankScore } : {}),
          ...(peakRating != null ? { peakRating } : {}),
          ...(peakScore != null ? { peakScore } : {}),
        },
      });
    }

    return jsonOk({ history }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}
