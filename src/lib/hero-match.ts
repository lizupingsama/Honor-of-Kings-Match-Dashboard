import { match as pinyinMatch } from "pinyin-pro";
import type { HeroMeta } from "@/lib/hero-power-api";

function textMatches(text: string, query: string): boolean {
  if (!text || !query) return false;
  if (text.toLowerCase().includes(query.toLowerCase())) return true;
  // 仅对含字母的查询走拼音（如 zy / zhaoyun）
  if (!/[a-zA-Z]/.test(query)) return false;
  return pinyinMatch(text, query, { continuous: true, v: true }) != null;
}

/** 匹配得分：越大越优先；0 表示不匹配 */
export function scoreHeroMatch(hero: HeroMeta, query: string): number {
  const q = query.trim();
  if (!q) return 0;

  const name = hero.name;
  const title = hero.title;
  const ename = hero.ename;
  const ql = q.toLowerCase();

  if (name === q) return 100;
  if (ename === q) return 95;
  if (name.toLowerCase() === ql) return 90;
  if (name.startsWith(q)) return 80;
  if (name.toLowerCase().startsWith(ql)) return 75;
  if (name.includes(q) || name.toLowerCase().includes(ql)) return 60;
  if (textMatches(name, q)) return 55;
  if (title.includes(q) || title.toLowerCase().includes(ql) || textMatches(title, q)) return 40;
  if (ename.includes(q)) return 20;
  return 0;
}

export function filterHeroesByQuery(heroes: HeroMeta[], query: string): HeroMeta[] {
  const q = query.trim();
  if (!q) return heroes;
  return heroes
    .map((h) => ({ h, score: scoreHeroMatch(h, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.h.name.localeCompare(b.h.name, "zh"))
    .map((x) => x.h);
}

/** 解析用户输入：唯一高分命中则返回该英雄，否则返回 null */
export function resolveHeroQuery(heroes: HeroMeta[], query: string): HeroMeta | null {
  const matched = filterHeroesByQuery(heroes, query);
  if (matched.length === 0) return null;
  if (matched.length === 1) return matched[0];

  const top = scoreHeroMatch(matched[0], query);
  const second = scoreHeroMatch(matched[1], query);
  // 唯一明显最优（如精确名 / 前缀）时直接采用
  if (top >= 75 && top > second) return matched[0];
  return null;
}
