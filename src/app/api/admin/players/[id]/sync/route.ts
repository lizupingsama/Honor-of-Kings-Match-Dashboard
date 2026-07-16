import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { syncPlayerById } from "@/lib/player-service";

type Ctx = { params: Promise<{ id: string }> };

/** POST: 管理后台强制刷新单个玩家（忽略冷却） */
export async function POST(_req: Request, ctx: Ctx) {
  try {
    await requireAdmin();
    const { id } = await ctx.params;
    const data = await syncPlayerById(id);
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
