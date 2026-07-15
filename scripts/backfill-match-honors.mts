import { PrismaClient } from "@prisma/client";
import { parseBattleHonors } from "../src/lib/camp/camp-client";

const p = new PrismaClient();

async function main() {
  const matches = await p.match.findMany({
    where: { rawJson: { not: null } },
    select: { id: true, rawJson: true },
  });

  const tiers = { gold: 0, silver: 0, bronze: 0, none: 0 };
  let updated = 0;
  for (const m of matches) {
    if (!m.rawJson) continue;
    try {
      const raw = JSON.parse(m.rawJson) as Record<string, unknown>;
      const honors = parseBattleHonors(raw);
      await p.match.update({
        where: { id: m.id },
        data: {
          mvp: honors.mvp,
          gold: honors.gold,
          medal: honors.medal || null,
          medalIcon: honors.medalIcon || null,
          mvpType: honors.mvpType || null,
          evaluate: honors.evaluate || null,
        },
      });
      updated += 1;
      if (!honors.medal) tiers.none += 1;
      else if (honors.medal.startsWith("金牌")) tiers.gold += 1;
      else if (honors.medal.startsWith("银牌")) tiers.silver += 1;
      else if (honors.medal.startsWith("铜牌")) tiers.bronze += 1;
    } catch {
      // ignore
    }
  }

  console.log(JSON.stringify({ scanned: matches.length, updated, tiers }, null, 2));
  await p.$disconnect();
}

main();
