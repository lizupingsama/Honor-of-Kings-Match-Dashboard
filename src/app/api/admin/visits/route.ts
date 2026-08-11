import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { prisma } from "@/lib/db";
import { lookupIpGeos } from "@/lib/ip-geo";
import { MAX_VISITS } from "@/lib/visit-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const PAGE_SIZE = 20;
const RECENT_LIMIT = 100;

type Source = "beacon" | "server" | "all";

/** COUNT(DISTINCT ip)：groupBy 拿不到、Prisma 也没有对应聚合，只能原生 SQL */
async function countDistinctIps(conds: Prisma.Sql[]) {
  const whereSql = conds.length
    ? Prisma.sql`WHERE ${Prisma.join(conds, " AND ")}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ c: bigint }[]>(
    Prisma.sql`SELECT COUNT(DISTINCT ip) AS c FROM "Visit" ${whereSql}`,
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
    const sourceParam = url.searchParams.get("source");
    const source: Source =
      sourceParam === "beacon" || sourceParam === "server" ? sourceParam : "all";

    const sourceWhere: Prisma.VisitWhereInput = source === "all" ? {} : { source };
    const where: Prisma.VisitWhereInput = {
      ...sourceWhere,
      ...(q ? { ip: { contains: q } } : {}),
    };
    const sourceSql = source === "all" ? [] : [Prisma.sql`source = ${source}`];
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, uniqueIps, todayPv, todayUvRows, ipsTotal, groups] = await Promise.all([
      prisma.visit.count({ where: sourceWhere }),
      countDistinctIps(sourceSql),
      prisma.visit.count({ where: { ...sourceWhere, createdAt: { gte: todayStart } } }),
      // 今日独立 IP：行数即今日 UV，量小；不用原生 SQL 以免依赖日期存储格式
      prisma.visit.findMany({
        where: { ...sourceWhere, createdAt: { gte: todayStart } },
        distinct: ["ip"],
        select: { ip: true },
      }),
      countDistinctIps(
        q ? [...sourceSql, Prisma.sql`ip LIKE ${"%" + q + "%"}`] : sourceSql,
      ),
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

    // 每个 IP 的最近一条记录（路径 / UA），一次查询取回；归属地离线解析
    const pageIps = groups.map((g) => g.ip);
    const [lastRows, geoByIp] = await Promise.all([
      pageIps.length
        ? prisma.visit.findMany({
            where: { ...sourceWhere, ip: { in: pageIps } },
            orderBy: { id: "desc" },
            distinct: ["ip"],
            select: { ip: true, path: true, userAgent: true },
          })
        : Promise.resolve([]),
      lookupIpGeos(pageIps),
    ]);
    const lastByIp = new Map(lastRows.map((r) => [r.ip, r]));

    const ips = groups.map((g) => ({
      ip: g.ip,
      geo: geoByIp.get(g.ip) ?? null,
      count: g._count._all,
      firstAt: g._min.createdAt,
      lastAt: g._max.createdAt,
      lastPath: lastByIp.get(g.ip)?.path ?? null,
      lastUserAgent: lastByIp.get(g.ip)?.userAgent ?? null,
    }));

    const recent = await prisma.visit.findMany({
      where: detailIp ? { ...sourceWhere, ip: detailIp } : where,
      orderBy: { id: "desc" },
      take: RECENT_LIMIT,
      select: {
        id: true,
        ip: true,
        path: true,
        userAgent: true,
        referer: true,
        source: true,
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
