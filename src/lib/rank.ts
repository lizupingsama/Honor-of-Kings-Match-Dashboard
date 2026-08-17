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

/**
 * 对局侧段位代码（营地战绩列表的 roleJob）。战绩行里的 roleJobName 是"拉取时"
 * 的当前段位而非对局时段位，只有 roleJob 跟随对局。编码不连续，顺序由全库
 * 升降段相邻场次实证（5星→下一代码1星 晋级、0星→上一代码4星 降级均吻合）：
 * 钻石 V–I = 20,21,13,14,15 → 星耀 V–I = 22–26 → 王者 = 16（星数直接累计）。
 * 钻石以下的代码没有实测数据，遇到时返回 null，由调用方回退到按段位名解析。
 */
const KING_RANK_CODE = 16;

const MATCH_RANK_CODES: Record<number, { name: string; base: number }> = (() => {
  const ladder: Array<[number, string]> = [
    [20, "永恒钻石V"],
    [21, "永恒钻石IV"],
    [13, "永恒钻石III"],
    [14, "永恒钻石II"],
    [15, "永恒钻石I"],
    [22, "至尊星耀V"],
    [23, "至尊星耀IV"],
    [24, "至尊星耀III"],
    [25, "至尊星耀II"],
    [26, "至尊星耀I"],
  ];
  const diamondBase = SUB_KING_RANKS.find((r) => r.key === "钻石")!.base;
  const map: Record<number, { name: string; base: number }> = {};
  ladder.forEach(([code, name], i) => {
    map[code] = { name, base: diamondBase + i * 5 };
  });
  return map;
})();

/** 按对局段位代码换算累计星数分；未知代码返回 null（调用方回退段位名解析） */
export function rankScoreFromCode(
  code: number | null | undefined,
  stars = 0,
): number | null {
  if (code == null) return null;
  if (code === KING_RANK_CODE) return KING_BASE + Math.max(0, stars);
  const info = MATCH_RANK_CODES[code];
  if (!info) return null;
  return info.base + Math.min(Math.max(stars, 0), 5);
}

/** 按对局段位代码还原段位名；王者(16)与未知代码返回 null（保留接口原名） */
export function rankNameFromCode(code: number | null | undefined): string | null {
  if (code == null) return null;
  return MATCH_RANK_CODES[code]?.name ?? null;
}

/**
 * 相邻两场排位的星数差超出该值视为断点（赛季重置/王者段位继承掉段），
 * 不作为"本场星数变化"展示。单场合法变化最多 ±3 左右（连胜加星）。
 */
export const MAX_PLAUSIBLE_STAR_DELTA = 10;

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
