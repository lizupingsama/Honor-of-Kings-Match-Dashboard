import { jsonError, jsonOk } from "@/lib/api";
import { syncDueHeroPowerMonitors } from "@/lib/hero-power-monitor";

export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return jsonError("未授权", 401);
    }
  }

  const { searchParams } = new URL(req.url);
  const rawLimit = Number(searchParams.get("limit") || "");
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(50, rawLimit) : 20;
  const results = await syncDueHeroPowerMonitors(limit);

  return jsonOk({
    synced: results.length,
    ok: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    results,
  });
}

export async function GET(req: Request) {
  return POST(req);
}
