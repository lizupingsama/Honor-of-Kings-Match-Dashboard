import {
  getPlayerDashboard,
  lookupPlayerByNickname,
  startPlayerSync,
} from "@/lib/player-service";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ nickname: string }> },
) {
  try {
    const { nickname: raw } = await ctx.params;
    const nickname = decodeURIComponent(raw);
    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";

    const filters = {
      range: searchParams.get("range") || "30",
      mode: searchParams.get("mode") || "all",
      result: searchParams.get("result") || "all",
      side: searchParams.get("side") || "all",
      hero: searchParams.get("hero") || "",
      page: Number(searchParams.get("page") || "1"),
    };

    if (refresh) {
      const { data, pendingSync } = await lookupPlayerByNickname(nickname, {
        forceRefresh: true,
      });
      if (pendingSync) {
        await startPlayerSync(pendingSync);
        const refreshed = await getPlayerDashboard(pendingSync.nickname, filters);
        return jsonOk(refreshed || data);
      }
      return jsonOk(data);
    }

    const data = await getPlayerDashboard(nickname, filters);
    if (!data) return jsonError("未找到该玩家", 404);
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
