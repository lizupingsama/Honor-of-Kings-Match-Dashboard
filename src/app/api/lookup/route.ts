import { z } from "zod";
import { lookupPlayerByCampId } from "@/lib/player-service";
import { handleRouteError, jsonOk } from "@/lib/api";

const schema = z.object({
  campId: z
    .string()
    .min(1, "请输入营地 ID")
    .regex(/^\d{5,15}$/, "营地 ID 应为 5–15 位数字"),
  forceRefresh: z.boolean().optional(),
});

/** POST: 按营地 ID 查询并同步 */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const data = await lookupPlayerByCampId(body.campId, {
      forceRefresh: body.forceRefresh,
    });
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
