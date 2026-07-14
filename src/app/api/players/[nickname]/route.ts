import { getPlayerDashboard, lookupPlayerByNickname } from "@/lib/player-service";
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

    if (refresh) {
      const data = await lookupPlayerByNickname(nickname, { forceRefresh: true });
      return jsonOk(data);
    }

    let data = await getPlayerDashboard(nickname, {
      range: searchParams.get("range") || "30",
      mode: searchParams.get("mode") || "all",
      result: searchParams.get("result") || "all",
      hero: searchParams.get("hero") || "",
      page: Number(searchParams.get("page") || "1"),
    });

    // 本地没有则自动拉取
    if (!data) {
      data = await lookupPlayerByNickname(nickname);
    } else {
      // 重新按筛选条件取（lookup 返回默认筛选，这里已有本地数据则用筛选）
      data = await getPlayerDashboard(nickname, {
        range: searchParams.get("range") || "30",
        mode: searchParams.get("mode") || "all",
        result: searchParams.get("result") || "all",
        hero: searchParams.get("hero") || "",
        page: Number(searchParams.get("page") || "1"),
      });
    }

    if (!data) return jsonError("未找到该玩家", 404);
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
