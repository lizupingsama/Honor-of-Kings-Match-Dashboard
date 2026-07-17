import { prisma } from "@/lib/db";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { parseEquipsJson } from "@/lib/match-equips";

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
        mvpType: match.mvpType,
        mvpIcon: match.mvpIcon,
        gold: match.gold,
        medal: match.medal,
        medalIcon: match.medalIcon,
        economy: match.economy,
        economyPct: match.economyPct,
        damage: match.damage,
        damagePct: match.damagePct,
        takenDamage: match.takenDamage,
        takenDamagePct: match.takenDamagePct,
        joinPct: match.joinPct,
        equips: parseEquipsJson(match.equipsJson),
        player: {
          gameNickname: match.player.gameNickname,
        },
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
