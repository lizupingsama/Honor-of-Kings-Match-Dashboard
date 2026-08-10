import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { MAX_VISITS } from "@/lib/visit-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 20;
const RECENT_LIMIT = 100;

async function countDistinctIps(where?: Prisma.Sql) {
  const rows = await prisma.$queryRaw<{ c: bigint }[]>(
    Prisma.sql`SELECT COUNT(DISTINCT ip) AS c FROM "Visit" ${where ?? Prisma.empty}`,
  );
  return Number(rows[0]?.c ?? 0);
}

export async function GET(req: Request) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() || "";
    const detailIp = url.searchParams.get("ip")?.trim() || "";
    const sort = url.searchParams.get("sort") === "count" ? "count" : "recent";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);

    const where: Prisma.VisitWhereInput = q ? { ip: { contains: q } } : {};
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, uniqueIps, todayPv, todayUvRows, ipsTotal, groups] = await Promise.all([
      prisma.visit.count(),
      countDistinctIps(),
      prisma.visit.count({ where: { createdAt: { gte: todayStart } } }),
      // 今日独立 IP：行数即今日 UV，量小；不用原生 SQL 以免依赖日期存储格式
      prisma.visit.findMany({
        where: { createdAt: { gte: todayStart } },
        distinct: ["ip"],
        select: { ip: true },
      }),
      q
        ? countDistinctIps(Prisma.sql`WHERE ip LIKE ${"%" + q + "%"}`)
        : countDistinctIps(),
      prisma.visit.groupBy({
        by: ["ip"],
        where,
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true },
        orderBy:
          sort === "count"
            ? { _count: { ip: "desc" } }
            : { _max: { createdAt: "desc" } },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    // 每个 IP 的最近一条记录（路径 / UA），一次查询取回
    const pageIps = groups.map((g) => g.ip);
    const lastRows = pageIps.length
      ? await prisma.visit.findMany({
          where: { ip: { in: pageIps } },
          orderBy: { id: "desc" },
          distinct: ["ip"],
          select: { ip: true, path: true, userAgent: true },
        })
      : [];
    const lastByIp = new Map(lastRows.map((r) => [r.ip, r]));

    const ips = groups.map((g) => ({
      ip: g.ip,
      count: g._count._all,
      firstAt: g._min.createdAt,
      lastAt: g._max.createdAt,
      lastPath: lastByIp.get(g.ip)?.path ?? null,
      lastUserAgent: lastByIp.get(g.ip)?.userAgent ?? null,
    }));

    const recent = await prisma.visit.findMany({
      where: detailIp ? { ip: detailIp } : where,
      orderBy: { id: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        ip: true,
        path: true,
        userAgent: true,
        referer: true,
        createdAt: true,
      },
    });

    return jsonOk({
      stats: { total, uniqueIps, todayPv, todayUv: todayUvRows.length, max: MAX_VISITS },
      ips,
      ipsTotal,
      page,
      pageSize: PAGE_SIZE,
      recent,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    const { count } = await prisma.visit.deleteMany({});
    return jsonOk({ cleared: count });
  } catch (err) {
    return handleRouteError(err);
  }
}
