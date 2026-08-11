import { prisma } from "./db";

/** 访问记录滚动上限：超过后按插入顺序删除最旧的 */
export const MAX_VISITS = 100_000;

export type VisitInput = {
  ip: string;
  path: string;
  userAgent?: string;
  referer?: string;
  xff?: string;
  /** server=proxy 服务端记录（含爬虫）；beacon=浏览器 JS 上报（真实访客） */
  source?: "server" | "beacon";
};

const clip = (v: string | undefined, max: number) =>
  v && v.length > max ? v.slice(0, max) : v;

/**
 * 写入一条访问记录并修剪超出 MAX_VISITS 的旧记录。
 * 自增 id 即插入序，修剪只需按 id 范围删除（走主键，绝大多数请求删 0 行）。
 */
export async function recordVisit(input: VisitInput) {
  const created = await prisma.visit.create({
    data: {
      ip: clip(input.ip, 64) || "unknown",
      path: clip(input.path, 512) || "/",
      userAgent: clip(input.userAgent, 300) ?? null,
      referer: clip(input.referer, 300) ?? null,
      xff: clip(input.xff, 500) ?? null,
      source: input.source === "beacon" ? "beacon" : "server",
    },
    select: { id: true },
  });
  await prisma.visit.deleteMany({
    where: { id: { lte: created.id - MAX_VISITS } },
  });
}
