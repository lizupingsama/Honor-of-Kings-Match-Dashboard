import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const matches = await p.match.findMany({
    where: { rawJson: { not: null }, side: null },
    select: { id: true, rawJson: true },
  });

  let updated = 0;
  for (const m of matches) {
    if (!m.rawJson) continue;
    try {
      const raw = JSON.parse(m.rawJson) as Record<string, unknown>;
      const campNum = Number(raw.AcntCamp ?? raw.acntCamp ?? raw.acnt_camp);
      const side = campNum === 1 ? "blue" : campNum === 2 ? "red" : null;
      if (!side) continue;
      await p.match.update({ where: { id: m.id }, data: { side } });
      updated += 1;
    } catch {
      // ignore
    }
  }

  console.log(JSON.stringify({ scanned: matches.length, updated }, null, 2));
  await p.$disconnect();
}

main();
