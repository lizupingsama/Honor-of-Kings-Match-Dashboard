/**
 * Next.js 启动钩子：冷却到期后自动同步榜上玩家。
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.AUTO_SYNC_ENABLED === "false") {
    return;
  }
  if (process.env.NODE_ENV === "test") {
    return;
  }

  // 避免 Turbopack / 多 worker 重复注册
  const g = globalThis as unknown as { __wzryAutoSyncStarted?: boolean };
  if (g.__wzryAutoSyncStarted) return;
  g.__wzryAutoSyncStarted = true;

  const { getCooldownSeconds, getAutoSyncBatchSize, autoSyncStalePlayers } =
    await import("./lib/player-service");

  const intervalMs = Math.max(60, getCooldownSeconds()) * 1000;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const results = await autoSyncStalePlayers(getAutoSyncBatchSize());
      if (results.length) {
        const ok = results.filter((r) => r.ok).length;
        console.info(
          `[auto-sync] synced ${ok}/${results.length} leaderboard players`,
        );
      }
    } catch (err) {
      console.error("[auto-sync] failed", err);
    } finally {
      running = false;
    }
  };

  // 启动稍后跑一轮，再按冷却周期循环
  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, intervalMs);
  }, 15_000);
}
