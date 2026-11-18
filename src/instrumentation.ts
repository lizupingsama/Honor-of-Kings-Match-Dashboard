/**
 * Next.js 启动钩子：按配置间隔自动同步到期玩家。
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const g = globalThis as unknown as {
    __wzryAutoSyncStarted?: boolean;
    __wzryHeroPowerMonitorStarted?: boolean;
  };

  if (process.env.AUTO_SYNC_ENABLED !== "false" && !g.__wzryAutoSyncStarted) {
    g.__wzryAutoSyncStarted = true;
    const { getAutoSyncIntervalSeconds, autoSyncStalePlayers } =
      await import("./lib/player-service");

    const intervalMs = getAutoSyncIntervalSeconds() * 1000;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const results = await autoSyncStalePlayers();
        if (results.length) {
          const ok = results.filter((r) => r.ok).length;
          console.info(`[auto-sync] synced ${ok}/${results.length} players`);
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

  if (
    process.env.HERO_POWER_MONITOR_ENABLED !== "false" &&
    !g.__wzryHeroPowerMonitorStarted
  ) {
    g.__wzryHeroPowerMonitorStarted = true;
    const {
      getHeroPowerMonitorCheckSeconds,
      syncDueHeroPowerMonitors,
    } = await import("./lib/hero-power-monitor");

    const checkMs = getHeroPowerMonitorCheckSeconds() * 1000;
    let running = false;

    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const results = await syncDueHeroPowerMonitors();
        if (results.length) {
          const ok = results.filter((result) => result.ok).length;
          console.info(
            `[hero-power-monitor] synced ${ok}/${results.length} monitors`,
          );
        }
      } catch (error) {
        console.error("[hero-power-monitor] failed", error);
      } finally {
        running = false;
      }
    };

    // lastAttemptAt 决定是否到期；轮询只负责及时发现到期项。
    setTimeout(() => {
      void tick();
      setInterval(() => {
        void tick();
      }, checkMs);
    }, 20_000);
  }
}
