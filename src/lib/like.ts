/** 东八区自然日，格式 YYYY-MM-DD */
export function shanghaiDayKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

const CLIENT_KEY_RE = /^[a-zA-Z0-9_-]{8,64}$/;

export function isValidClientKey(key: unknown): key is string {
  return typeof key === "string" && CLIENT_KEY_RE.test(key);
}
