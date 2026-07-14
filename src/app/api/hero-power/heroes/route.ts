import { fetchHeroList } from "@/lib/hero-power-api";
import { handleRouteError, jsonOk } from "@/lib/api";

/** GET: 英雄列表（供战力查询选择器） */
export async function GET() {
  try {
    const list = await fetchHeroList();
    return jsonOk({ list });
  } catch (err) {
    return handleRouteError(err);
  }
}
