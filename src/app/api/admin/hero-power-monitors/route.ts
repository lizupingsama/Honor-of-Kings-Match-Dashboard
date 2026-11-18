import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import {
  getHeroPowerMonitorIntervalHours,
  POWER_ZONES,
  syncHeroPowerMonitor,
} from "@/lib/hero-power-monitor";

const createSchema = z.object({
  heroId: z.string().trim().min(1, "请选择英雄").max(64),
  heroName: z.string().trim().min(1).max(100).optional(),
  heroAvatar: z.string().trim().max(2048).optional(),
  zone: z.enum(POWER_ZONES),
});

/** GET: 管理端监测列表 */
export async function GET() {
  try {
    await requireAdmin();
    const monitors = await prisma.heroPowerMonitor.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        snapshots: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });
    const intervalHours = getHeroPowerMonitorIntervalHours();

    return jsonOk({
      intervalHours,
      monitors: monitors.map(({ snapshots, ...monitor }) => ({
        ...monitor,
        latest: snapshots[0] || null,
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

/** POST: 新增英雄监测并立即采集首个数据点 */
export async function POST(req: Request) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.parse(body);

    let monitor;
    try {
      monitor = await prisma.heroPowerMonitor.create({
        data: {
          heroId: parsed.heroId,
          heroName: parsed.heroName || parsed.heroId,
          heroAvatar: parsed.heroAvatar || null,
          zone: parsed.zone,
          intervalHours: getHeroPowerMonitorIntervalHours(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return jsonError("该英雄已经加入当前区服的监测列表", 409);
      }
      throw error;
    }

    const sync = await syncHeroPowerMonitor(monitor.id, "initial");
    const fresh = await prisma.heroPowerMonitor.findUnique({
      where: { id: monitor.id },
      include: {
        snapshots: {
          orderBy: { recordedAt: "desc" },
          take: 1,
        },
      },
    });

    return jsonOk(
      {
        monitor: fresh,
        sync,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
