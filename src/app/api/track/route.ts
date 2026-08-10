import { z } from "zod";
import { getTrackSecret } from "@/lib/client-ip";
import { recordVisit } from "@/lib/visit-log";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * proxy 的内部访问统计上报端点。
 * 仅接受携带正确 x-track-secret 的请求；统计写入失败一律静默，
 * 不产生对外可见的错误。
 */

const bodySchema = z.object({
  ip: z.string().min(1).max(64),
  path: z.string().min(1).max(512),
  userAgent: z.string().max(512).optional(),
  referer: z.string().max(512).optional(),
  xff: z.string().max(512).optional(),
});

export async function POST(req: Request) {
  if (req.headers.get("x-track-secret") !== getTrackSecret()) {
    return new Response(null, { status: 403 });
  }
  try {
    const body = bodySchema.parse(await req.json());
    await recordVisit(body);
  } catch (err) {
    console.error("[track] 记录访问失败:", err);
  }
  return new Response(null, { status: 204 });
}
