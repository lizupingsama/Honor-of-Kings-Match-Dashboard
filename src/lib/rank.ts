/** Map rank name + stars to a comparable score for charts & leaderboards.
 *
 * 分数 = 累计星数：青铜III 0星 = 0，每颗星 +1，一路累加到星耀I 满星 = 100，
 * 王者 = 100 + 王者星数。这样相邻两场排位的分数差正好等于星数变化，
 * 跨小段（星耀3 5星 → 星耀2 1星 = +1）和跨大段晋级也成立。
 */

type RankDef = { key: string; tiers: number; starsPerTier: number; base: number };

// 王者以下段位结构：小段数 × 每小段星数（base 为该段位起点的累计星数）
const SUB_KING_RANKS: RankDef[] = (() => {
  const defs = [
    { key: "青铜", tiers: 3, starsPerTier: 3 },
    { key: "白银", tiers: 3, starsPerTier: 3 },
    { key: "黄金", tiers: 4, starsPerTier: 4 },
    { key: "铂金", tiers: 4, starsPerTier: 4 },
    { key: "钻石", tiers: 5, starsPerTier: 5 },
    { key: "星耀", tiers: 5, starsPerTier: 5 },
  ];
  let base = 0;
  return defs.map((d) => {
    const withBase = { ...d, base };
    base += d.tiers * d.starsPerTier;
    return withBase;
  });
})();

// 星耀I 满星（累计 100 星）再赢一场 = 王者 1 星
const KING_BASE = 100;

// 小段位写法：ASCII 罗马数字（IV 在 I/V 前，避免子串误匹配）、罗马字符、中文、阿拉伯数字
const TIER_TOKENS: Array<[string, number]> = [
  ["IV", 4],
  ["III", 3],
  ["II", 2],
  ["V", 5],
  ["I", 1],
  ["Ⅴ", 5],
  ["Ⅳ", 4],
  ["Ⅲ", 3],
  ["Ⅱ", 2],
  ["Ⅰ", 1],
  ["五", 5],
  ["四", 4],
  ["三", 3],
  ["二", 2],
  ["一", 1],
  ["5", 5],
  ["4", 4],
  ["3", 3],
  ["2", 2],
  ["1", 1],
];

function parseTier(name: string): number | null {
  for (const [token, tier] of TIER_TOKENS) {
    if (name.includes(token)) return tier;
  }
  return null;
}

export function parseRankScore(rankName: string | null | undefined, stars = 0): number {
  if (!rankName) return 0;
  const name = stripRankStars(rankName.trim());
  const embedded = rankName.match(/(\d+)\s*星\s*$/u);
  const starCount = stars > 0 ? stars : embedded ? Number(embedded[1]) : 0;

  // 王者（最强/无双/绝世/至圣/荣耀王者）— 星数直接累计
  if (name.includes("王者")) {
    return KING_BASE + Math.max(0, starCount);
  }

  for (const rank of SUB_KING_RANKS) {
    if (!name.includes(rank.key)) continue;
    // 小段位数字越小段位越高（星耀5 最低、星耀1 最高），识别不出时按最低小段
    const tier = parseTier(name) ?? rank.tiers;
    const tierIdx = Math.min(Math.max(rank.tiers - tier, 0), rank.tiers - 1);
    const starsInTier = Math.min(Math.max(starCount, 0), rank.starsPerTier);
    return rank.base + tierIdx * rank.starsPerTier + starsInTier;
  }

  // Fallback: try numeric extraction
  return Math.max(0, starCount);
}

export function stripRankStars(rankName: string): string {
  return rankName.replace(/\s*\d+\s*星\s*$/u, "").trim();
}

export function formatRankLabel(rankName: string | null | undefined, stars = 0): string {
  if (!rankName) return "未知";
  const name = stripRankStars(rankName);
  if (!name) return stars > 0 ? `${stars}星` : "未知";
  if (stars > 0) return `${name} ${stars}星`;
  return name;
}

export function scoreToApproxLabel(score: number): string {
  if (score >= KING_BASE) return `王者 ${score - KING_BASE}星`;
  for (let i = SUB_KING_RANKS.length - 1; i >= 0; i--) {
    const rank = SUB_KING_RANKS[i];
    if (score < rank.base) continue;
    const within = score - rank.base;
    const tier = rank.tiers - Math.min(Math.floor(within / rank.starsPerTier), rank.tiers - 1);
    return `${rank.key}${tier}`;
  }
  return "青铜3";
}
