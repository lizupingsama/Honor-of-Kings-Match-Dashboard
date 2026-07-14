import { z } from "zod";
import { queryHeroPower } from "@/lib/hero-power-api";
import { handleRouteError, jsonOk } from "@/lib/api";

const schema = z
  .object({
    hero: z.string().trim().optional(),
    heroId: z.string().trim().optional(),
    zone: z.enum(["aqq", "awx", "iqq", "iwx"]),
    type: z.enum(["all", "min", "max"]).optional().default("all"),
  })
  .refine((v) => Boolean(v.hero || v.heroId), {
    message: "请指定英雄名称或 ID",
  });

/** GET: 查询全国英雄战力门槛 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = schema.parse({
      hero: searchParams.get("hero") || undefined,
      heroId: searchParams.get("heroId") || undefined,
      zone: searchParams.get("zone") || undefined,
      type: searchParams.get("type") || "all",
    });

    const data = await queryHeroPower({
      hero: parsed.hero,
      heroId: parsed.heroId,
      zone: parsed.zone,
      type: parsed.type,
    });
    return jsonOk(data);
  } catch (err) {
    return handleRouteError(err);
  }
}
