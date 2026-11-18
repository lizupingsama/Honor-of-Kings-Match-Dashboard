import {
  extractHeroPowerCapture,
  HeroPowerApiError,
  type PowerZone,
  queryHeroPower,
} from "@/lib/hero-power-api";
import { prisma } from "@/lib/db";

export const POWER_ZONES = ["aqq", "awx", "iqq", "iwx"] as const;

export const HERO_POWER_MONITOR_DEFAULT_INTERVAL_HOURS = 8;
export const HERO_POWER_MONITOR_DEFAULT_CHECK_SECONDS = 300;

export type HeroPowerMonitorSyncResult = {
  monitorId: string;
  heroId: string;
  heroName: string;
  ok: boolean;
  recordedAt?: string;
  error?: string;
};

function readPositiveNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getHeroPowerMonitorIntervalHours() {
  return Math.max(
    1,
    Math.round(
      readPositiveNumber(
        process.env.HERO_POWER_MONITOR_INTERVAL_HOURS,
        HERO_POWER_MONITOR_DEFAULT_INTERVAL_HOURS,
      ),
    ),
  );
}

export function getHeroPowerMonitorCheckSeconds() {
  return Math.max(
    30,
    Math.round(
      readPositiveNumber(
        process.env.HERO_POWER_MONITOR_CHECK_SECONDS,
        HERO_POWER_MONITOR_DEFAULT_CHECK_SECONDS,
      ),
    ),
  );
}

export function isPowerZone(value: string): value is PowerZone {
  return (POWER_ZONES as readonly string[]).includes(value);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "采集失败";
}

export async function syncHeroPowerMonitor(
  monitorId: string,
  source: "auto" | "initial" | "manual" = "auto",
): Promise<HeroPowerMonitorSyncResult> {
  const monitor = await prisma.heroPowerMonitor.findUnique({
    where: { id: monitorId },
  });
  if (!monitor) {
    const error = new Error("监测项不存在") as Error & { status: number };
    error.status = 404;
    throw error;
  }
  if (!isPowerZone(monitor.zone)) {
    const error = new Error("监测项区服配置无效") as Error & { status: number };
    error.status = 400;
    throw error;
  }

  try {
    const result = await queryHeroPower({
      heroId: monitor.heroId,
      zone: monitor.zone,
      type: "all",
    });
    const capture = extractHeroPowerCapture(result);
    if (Object.values(capture.minima).every((value) => value == null)) {
      throw new HeroPowerApiError("本次未返回可记录的战力门槛", "upstream", 502);
    }

    const recordedAt = new Date();
    await prisma.$transaction([
      prisma.heroPowerMonitorSnapshot.create({
        data: {
          monitorId: monitor.id,
          recordedAt,
          provincePowersJson:
            Object.keys(capture.provincePowers).length > 0
              ? JSON.stringify(capture.provincePowers)
              : null,
          provincePower: capture.minima.province,
          cityPower: capture.minima.city,
          districtPower: capture.minima.district,
          source,
        },
      }),
      prisma.heroPowerMonitor.update({
        where: { id: monitor.id },
        data: {
          heroName: result.hero.name || monitor.heroName,
          heroAvatar: result.hero.avatar || monitor.heroAvatar,
          intervalHours: getHeroPowerMonitorIntervalHours(),
          lastAttemptAt: recordedAt,
          lastSyncedAt: recordedAt,
          lastSyncError: null,
        },
      }),
    ]);

    return {
      monitorId: monitor.id,
      heroId: monitor.heroId,
      heroName: result.hero.name || monitor.heroName,
      ok: true,
      recordedAt: recordedAt.toISOString(),
    };
  } catch (error) {
    const message = errorMessage(error).slice(0, 500);
    await prisma.heroPowerMonitor
      .update({
        where: { id: monitor.id },
        data: {
          lastAttemptAt: new Date(),
          lastSyncError: message,
        },
      })
      .catch(() => undefined);

    return {
      monitorId: monitor.id,
      heroId: monitor.heroId,
      heroName: monitor.heroName,
      ok: false,
      error: message,
    };
  }
}

export async function syncDueHeroPowerMonitors(limit = 20) {
  const intervalHours = getHeroPowerMonitorIntervalHours();
  const cutoff = new Date(Date.now() - intervalHours * 60 * 60 * 1000);
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const monitors = await prisma.heroPowerMonitor.findMany({
    where: {
      enabled: true,
      OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: cutoff } }],
    },
    orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
    take: safeLimit,
    select: { id: true },
  });

  const results: HeroPowerMonitorSyncResult[] = [];
  for (const monitor of monitors) {
    const claimed = await prisma.heroPowerMonitor.updateMany({
      where: {
        id: monitor.id,
        enabled: true,
        OR: [{ lastAttemptAt: null }, { lastAttemptAt: { lte: cutoff } }],
      },
      data: { lastAttemptAt: new Date() },
    });
    if (claimed.count === 0) continue;
    results.push(await syncHeroPowerMonitor(monitor.id, "auto"));
  }
  return results;
}
