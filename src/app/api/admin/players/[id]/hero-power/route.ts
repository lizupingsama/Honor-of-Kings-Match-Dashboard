import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { recordHeroPowerSnapshot } from "@/lib/score-history";

const powerSchema = z.object({
  heroName: z.string().trim().min(1, "请输入英雄名称"),
  heroId: z.string().trim().nullable().optional(),
  combatPower: z.number().int().min(0),
  recordedAt: z.string().datetime().optional(),
  note: z.string().nullable().optional(),
  applyToStat: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const body = powerSchema.parse(await req.json());

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) return jsonError("玩家不存在", 404);

    const history = await recordHeroPowerSnapshot(id, {
      heroName: body.heroName,
      heroId: body.heroId,
      combatPower: body.combatPower,
      source: "manual",
      recordedAt: body.recordedAt ? new Date(body.recordedAt) : undefined,
      note: body.note,
      applyToStat: body.applyToStat,
    });

    return jsonOk({ history }, { status: 201 });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const heroName = (searchParams.get("hero") || "").trim();
    if (!heroName) return jsonError("请指定英雄", 400);

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) return jsonError("玩家不存在", 404);

    await prisma.heroStat.deleteMany({ where: { playerId: id, heroName } });
    await prisma.heroPowerHistory.deleteMany({
      where: { playerId: id, heroName },
    });

    return jsonOk({ deleted: true, heroName });
  } catch (err) {
    return handleRouteError(err);
  }
}
