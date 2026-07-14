import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const existing = await prisma.scoreHistory.findUnique({ where: { id } });
    if (!existing) return jsonError("记录不存在", 404);
    await prisma.scoreHistory.delete({ where: { id } });
    return jsonOk({ deleted: true, id });
  } catch (err) {
    return handleRouteError(err);
  }
}
