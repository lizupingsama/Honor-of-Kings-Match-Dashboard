import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { syncHeroPowerMonitor } from "@/lib/hero-power-monitor";

export const maxDuration = 60;

/** POST: 立即采集一个监测项 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const result = await syncHeroPowerMonitor(id, "manual");
    if (!result.ok) {
      return jsonError(result.error || "采集失败", 502, { sync: result });
    }
    return jsonOk({ sync: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
