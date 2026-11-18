import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";

const patchSchema = z.object({
  enabled: z.boolean(),
});

/** PATCH: 启用或暂停监测 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const parsed = patchSchema.parse(await req.json());
    const monitor = await prisma.heroPowerMonitor.update({
      where: { id },
      data: { enabled: parsed.enabled },
    });
    return jsonOk({ monitor });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** DELETE: 删除监测项及其全部历史快照 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const existing = await prisma.heroPowerMonitor.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      const error = new Error("监测项不存在") as Error & { status: number };
      error.status = 404;
      throw error;
    }
    await prisma.heroPowerMonitor.delete({ where: { id } });
    return jsonOk({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
