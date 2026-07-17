import { after } from "next/server";
import { z } from "zod";
import { getPlayerDashboard, lookupPlayerByCampId, startPlayerSync } from "@/lib/player-service";
import { handleRouteError, jsonOk } from "@/lib/api";

const schema = z.object({
  campId: z
    .string()
    .min(1, "请输入营地 ID")
    .regex(/^\d{5,15}$/, "营地 ID 应为 5–15 位数字"),
  forceRefresh: z.boolean().optional(),
});

/** POST: 按营地 ID 查询；需要同步时后台继续拉战绩，立即返回看板壳 */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const { data, pendingSync } = await lookupPlayerByCampId(body.campId, {
      forceRefresh: body.forceRefresh,
    });

    if (pendingSync) {
      if (body.forceRefresh) {
        await startPlayerSync(pendingSync);
        const refreshed = await getPlayerDashboard(pendingSync.nickname);
        return jsonOk(refreshed || data);
      }

      after(async () => {
        try {
          await startPlayerSync(pendingSync);
        } catch {
          // 错误已写入 SyncJob / lastSyncError，前端轮询可见
        }
      });
    }

    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
