import { autoSyncStalePlayers } from "@/lib/player-service";
import { jsonOk, jsonError } from "@/lib/api";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return jsonError("未授权", 401);
    }
  }

  const results = await autoSyncStalePlayers(30);
  return jsonOk({
    synced: results.length,
    ok: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
