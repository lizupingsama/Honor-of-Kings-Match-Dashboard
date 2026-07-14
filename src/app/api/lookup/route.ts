import { z } from "zod";
import { lookupPlayerByNickname } from "@/lib/player-service";
import { handleRouteError, jsonOk } from "@/lib/api";

const schema = z.object({
  nickname: z.string().min(1, "请输入王者名称").max(32),
  forceRefresh: z.boolean().optional(),
});

/** POST: 按王者名称查询并同步 */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const data = await lookupPlayerByNickname(body.nickname, {
      forceRefresh: body.forceRefresh,
    });
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
