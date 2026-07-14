/** Map rank name + stars to a comparable score for charts & leaderboards */

const RANK_BASE: Record<string, number> = {
  青铜: 0,
  白银: 100,
  黄金: 200,
  铂金: 300,
  黄金星耀: 300, // alias
  星耀: 400,
  王者: 500,
  荣耀王者: 500,
  最强王者: 500,
};

const TIER_OFFSET: Record<string, number> = {
  III: 0,
  II: 25,
  I: 50,
  "Ⅲ": 0,
  "Ⅱ": 25,
  "Ⅰ": 50,
  三: 0,
  二: 25,
  一: 50,
};

export function parseRankScore(rankName: string | null | undefined, stars = 0): number {
  if (!rankName) return 0;
  const name = rankName.trim();

  // 王者 / 荣耀王者 / 最强王者 — stars count directly
  if (name.includes("王者")) {
    const base = 500;
    return base + Math.max(0, stars);
  }

  for (const [key, base] of Object.entries(RANK_BASE)) {
    if (name.includes(key) && key !== "王者" && key !== "荣耀王者" && key !== "最强王者") {
      let offset = 0;
      for (const [tier, val] of Object.entries(TIER_OFFSET)) {
        if (name.includes(tier)) {
          offset = val;
          break;
        }
      }
      // Also match 青铜III style without space
      return base + offset + Math.min(stars, 24);
    }
  }

  // Fallback: try numeric extraction
  return Math.max(0, stars);
}

export function formatRankLabel(rankName: string | null | undefined, stars = 0): string {
  if (!rankName) return "未知";
  if (rankName.includes("王者")) return `${rankName} ${stars}星`;
  return stars > 0 ? `${rankName} ${stars}星` : rankName;
}

export function scoreToApproxLabel(score: number): string {
  if (score >= 500) return `王者 ${score - 500}星`;
  if (score >= 400) return "星耀";
  if (score >= 300) return "铂金";
  if (score >= 200) return "黄金";
  if (score >= 100) return "白银";
  return "青铜";
}
