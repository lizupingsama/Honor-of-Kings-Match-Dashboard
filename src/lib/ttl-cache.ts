/** 进程内短 TTL 缓存：用于排行榜等可容忍数十秒延迟的重查询 */

type Entry = { value: unknown; expiresAt: number };

const store = new Map<string, Entry>();
const MAX_ENTRIES = 500;

export async function cached<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await fn();

  if (store.size >= MAX_ENTRIES) {
    for (const [k, e] of store) {
      if (e.expiresAt <= now) store.delete(k);
    }
    // 清完过期项仍满时按插入顺序淘汰最旧的
    while (store.size >= MAX_ENTRIES) {
      const oldest = store.keys().next().value;
      if (oldest == null) break;
      store.delete(oldest);
    }
  }
  store.set(key, { value, expiresAt: now + ttlMs });
  return value;
}
