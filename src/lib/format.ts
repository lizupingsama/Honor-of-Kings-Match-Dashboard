/** 输出/承伤等大数值按 k 展示，如 15234 → 15.2k */
export function fmtK(n: number) {
  const k = Math.round((n / 1000) * 10) / 10;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}k`;
}
