import { prisma } from "@/lib/db";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const match = await prisma.match.findUnique({
      where: { id },
      include: {
        player: { select: { gameNickname: true } },
      },
    });
    if (!match) return jsonError("对局不存在", 404);

    return jsonOk({
      match: {
        id: match.id,
        playedAt: match.playedAt,
        mode: match.mode,
        modeName: match.modeName,
        heroName: match.heroName,
        heroIcon: match.heroIcon,
        result: match.result,
        kills: match.kills,
        deaths: match.deaths,
        assists: match.assists,
        score: match.score,
        evaluate: match.evaluate,
        durationSec: match.durationSec,
        rankName: match.rankName,
        stars: match.stars,
        mvp: match.mvp,
        gold: match.gold,
        economy: match.economy,
        damage: match.damage,
        player: {
          gameNickname: match.player.gameNickname,
        },
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
