import { z } from "zod";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getHeroPowerMonitorIntervalHours, POWER_ZONES } from "@/lib/hero-power-monitor";

const schema = z.object({
  heroId: z.string().trim().min(1, "请指定英雄"),
  zone: z.enum(POWER_ZONES),
  range: z.enum(["8h", "1d", "7d"]).default("1d"),
});

const RANGE_MS: Record<"8h" | "1d" | "7d", number> = {
  "8h": 8 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

function parseProvincePowers(value: string | null, fallback: number | null) {
  if (value) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return Object.fromEntries(
          Object.entries(parsed).filter(
            ([province, power]) =>
              Boolean(province) &&
              typeof power === "number" &&
              Number.isFinite(power),
          ),
        ) as Record<string, number>;
      }
    } catch {
      // Fall through to legacy value.
    }
  }
  return fallback == null ? {} : { "全国最低（旧数据）": fallback };
}

/** GET: 获取已监测英雄在指定时间跨度内的战力门槛曲线 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = schema.parse({
      heroId: searchParams.get("heroId") || undefined,
      zone: searchParams.get("zone") || undefined,
      range: searchParams.get("range") || "1d",
    });
    const monitor = await prisma.heroPowerMonitor.findUnique({
      where: {
        heroId_zone: {
          heroId: parsed.heroId,
          zone: parsed.zone,
        },
      },
      select: {
        id: true,
        heroId: true,
        heroName: true,
        heroAvatar: true,
        zone: true,
        enabled: true,
        intervalHours: true,
        lastAttemptAt: true,
        lastSyncedAt: true,
        lastSyncError: true,
      },
    });

    if (!monitor) {
      return jsonOk({
        monitor: null,
        range: parsed.range,
        points: [],
      });
    }

    const intervalHours = getHeroPowerMonitorIntervalHours();
    const since = new Date(Date.now() - RANGE_MS[parsed.range]);
    const points = await prisma.heroPowerMonitorSnapshot.findMany({
      where: {
        monitorId: monitor.id,
        recordedAt: { gte: since },
      },
      orderBy: { recordedAt: "asc" },
      select: {
        recordedAt: true,
        provincePowersJson: true,
        provincePower: true,
        cityPower: true,
        districtPower: true,
        source: true,
      },
    });

    return jsonOk({
      monitor: {
        ...monitor,
        intervalHours,
        nextSyncAt: monitor.lastAttemptAt
          ? new Date(monitor.lastAttemptAt.getTime() + intervalHours * 60 * 60 * 1000)
          : null,
      },
      range: parsed.range,
      points: points.map(({ provincePowersJson, provincePower, ...point }) => ({
        ...point,
        provincePowers: parseProvincePowers(provincePowersJson, provincePower),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
