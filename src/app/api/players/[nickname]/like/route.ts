import { prisma } from "@/lib/db";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { isValidClientKey, shanghaiDayKey } from "@/lib/like";

type Ctx = { params: Promise<{ nickname: string }> };

async function findPlayer(nickname: string) {
  return prisma.player.findUnique({
    where: { gameNickname: nickname },
    select: { id: true },
  });
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const { nickname: raw } = await ctx.params;
    const nickname = decodeURIComponent(raw);
    const player = await findPlayer(nickname);
    if (!player) return jsonError("未找到该玩家", 404);

    const clientKey = new URL(req.url).searchParams.get("clientKey") || "";
    const dayKey = shanghaiDayKey();
    const [likeCount, liked] = await Promise.all([
      prisma.playerLike.count({ where: { playerId: player.id } }),
      isValidClientKey(clientKey)
        ? prisma.playerLike.findUnique({
            where: {
              playerId_clientKey_dayKey: {
                playerId: player.id,
                clientKey,
                dayKey,
              },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);

    return jsonOk({ likeCount, likedToday: Boolean(liked), dayKey });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request, ctx: Ctx) {
  try {
    const { nickname: raw } = await ctx.params;
    const nickname = decodeURIComponent(raw);
    const player = await findPlayer(nickname);
    if (!player) return jsonError("未找到该玩家", 404);

    const body = (await req.json().catch(() => ({}))) as { clientKey?: string };
    if (!isValidClientKey(body.clientKey)) {
      return jsonError("无效的客户端标识", 400);
    }

    const dayKey = shanghaiDayKey();
    try {
      await prisma.playerLike.create({
        data: {
          playerId: player.id,
          clientKey: body.clientKey,
          dayKey,
        },
      });
    } catch {
      const likeCount = await prisma.playerLike.count({
        where: { playerId: player.id },
      });
      return jsonError("今天已经点过赞了", 409, {
        likeCount,
        likedToday: true,
        dayKey,
      });
    }

    const likeCount = await prisma.playerLike.count({
      where: { playerId: player.id },
    });
    return jsonOk({ likeCount, likedToday: true, dayKey });
  } catch (err) {
    return handleRouteError(err);
  }
}
