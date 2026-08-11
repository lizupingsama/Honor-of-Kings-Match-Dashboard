import { z } from "zod";
import { extractClientIp, getTrackSecret } from "@/lib/client-ip";
import { recordVisit } from "@/lib/visit-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * 访问统计上报端点，两种来源：
 * - 服务端（proxy）：携带 x-track-secret，body 可信，记为 source=server（含爬虫）；
 * - 浏览器 beacon：无密钥，body 只取 path，IP/UA/来源一律从请求头还原，
 *   记为 source=beacon（执行了 JS 的真实访客）。
 * 统计写入失败一律静默，不产生对外可见的错误。
 */

const serverSchema = z.object({
  ip: z.string().min(1).max(64),
  path: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
  referer: z.string().max(512).optional(),
  xff: z.string().max(512).optional(),
});

const beaconSchema = z.object({
  path: z.string().min(1).max(512).startsWith("/"),
});

export async function POST(req: Request) {
  try {
    if (req.headers.get("x-track-secret") === getTrackSecret()) {
      const body = serverSchema.parse(await req.json());
      await recordVisit({ ...body, source: "server" });
    } else {
      const body = beaconSchema.parse(await req.json());
      const xff = req.headers.get("x-forwarded-for");
      await recordVisit({
        ip: extractClientIp(xff, req.headers.get("x-real-ip")),
        path: body.path,
        userAgent: req.headers.get("user-agent") ?? undefined,
        referer: req.headers.get("referer") ?? undefined,
        xff: xff ?? undefined,
        source: "beacon",
      });
    }
  } catch (err) {
    console.error("[track] 记录访问失败:", err);
  }
  return new Response(null, { status: 204 });
}
