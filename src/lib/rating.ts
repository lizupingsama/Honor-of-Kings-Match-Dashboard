/** 排位/巅峰评分合法范围 */
export const RATING_MIN = 0;
export const RATING_MAX = 110;

export function clampRating(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(RATING_MIN, Math.min(RATING_MAX, Math.round(n)));
}

export function clampWinRate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(0, Math.min(100, n)) * 10) / 10;
}
