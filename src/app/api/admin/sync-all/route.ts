import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { syncAllPlayers } from "@/lib/player-service";

export async function POST() {
  try {
    await requireAdmin();
    const results = await syncAllPlayers();
    return jsonOk({
      synced: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
