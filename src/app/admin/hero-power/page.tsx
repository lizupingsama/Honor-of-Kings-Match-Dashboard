"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { HeroMeta, PowerZone } from "@/lib/hero-power-api";
import { apiFetch } from "@/lib/client-fetch";

type Snapshot = {
  id: string;
  recordedAt: string;
  provincePower: number | null;
  cityPower: number | null;
  districtPower: number | null;
  source: string;
};

type Monitor = {
  id: string;
  heroId: string;
  heroName: string;
  heroAvatar: string | null;
  zone: PowerZone;
  enabled: boolean;
  intervalHours: number;
  lastAttemptAt: string | null;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  latest: Snapshot | null;
};

const ZONES: { value: PowerZone; label: string }[] = [
  { value: "aqq", label: "安卓 QQ" },
  { value: "awx", label: "安卓 微信" },
  { value: "iqq", label: "iOS QQ" },
  { value: "iwx", label: "iOS 微信" },
];

function zoneLabel(zone: string) {
  return ZONES.find((item) => item.value === zone)?.label || zone;
}

function formatPower(value: number | null | undefined) {
  return value == null ? "—" : value.toLocaleString("zh-CN");
}

export default function HeroPowerAdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [intervalHours, setIntervalHours] = useState(8);
  const [heroId, setHeroId] = useState("");
  const [zone, setZone] = useState<PowerZone>("aqq");
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadMonitors = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/hero-power-monitors");
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!json.ok) {
        setError(json.error || "加载监测列表失败");
        return;
      }
      setMonitors(json.data.monitors || []);
      setIntervalHours(json.data.intervalHours || 8);
    } catch {
      setError("网络错误，无法加载监测列表");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    apiFetch("/api/admin/auth")
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok || !json.data.authenticated) {
          router.replace("/admin/login");
          return;
        }
        setReady(true);
      })
      .catch(() => router.replace("/admin/login"));
  }, [router]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    apiFetch("/api/admin/hero-power-monitors")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!json.ok) {
          setError(json.error || "加载监测列表失败");
          return;
        }
        setMonitors(json.data.monitors || []);
        setIntervalHours(json.data.intervalHours || 8);
      })
      .catch(() => {
        if (!cancelled) setError("网络错误，无法加载监测列表");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    apiFetch("/api/hero-power/heroes")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "加载英雄列表失败");
          return;
        }
        const list = (json.data.list || []) as HeroMeta[];
        setHeroes(
          list.slice().sort((a, b) => a.name.localeCompare(b.name, "zh-CN")),
        );
      })
      .catch(() => {
        if (!cancelled) setError("网络错误，无法加载英雄列表");
      });
    return () => {
      cancelled = true;
    };
  }, [ready, router]);

  const selectedHero = useMemo(
    () => heroes.find((hero) => hero.ename === heroId) || null,
    [heroes, heroId],
  );

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!heroId) {
      setError("请选择要监测的英雄");
      return;
    }

    setAdding(true);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch("/api/admin/hero-power-monitors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heroId,
          heroName: selectedHero?.name,
          heroAvatar: selectedHero?.avatar,
          zone,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "添加失败");
        return;
      }
      if (json.data.sync?.ok) {
        setMessage(`已添加「${selectedHero?.name || heroId}」并完成首次采集`);
      } else {
        setMessage(`已添加「${selectedHero?.name || heroId}」，首次采集失败，可稍后手动重试`);
      }
      setHeroId("");
      await loadMonitors();
    } catch {
      setError("网络错误，添加失败");
    } finally {
      setAdding(false);
    }
  }

  async function onSync(monitor: Monitor) {
    setSyncingId(monitor.id);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(
        `/api/admin/hero-power-monitors/${monitor.id}/sync`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || `采集「${monitor.heroName}」失败`);
        await loadMonitors();
        return;
      }
      setMessage(`已采集「${monitor.heroName}」当前战力门槛`);
      await loadMonitors();
    } catch {
      setError("网络错误，采集失败");
    } finally {
      setSyncingId(null);
    }
  }

  async function onToggle(monitor: Monitor) {
    setTogglingId(monitor.id);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(`/api/admin/hero-power-monitors/${monitor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !monitor.enabled }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "更新监测状态失败");
        return;
      }
      setMessage(
        `已${json.data.monitor.enabled ? "启用" : "暂停"}「${monitor.heroName}」自动采集`,
      );
      await loadMonitors();
    } catch {
      setError("网络错误，更新状态失败");
    } finally {
      setTogglingId(null);
    }
  }

  async function onDelete(monitor: Monitor) {
    if (
      !confirm(
        `确认删除「${monitor.heroName} · ${zoneLabel(monitor.zone)}」及其全部战力曲线历史？`,
      )
    ) {
      return;
    }

    setDeletingId(monitor.id);
    setError("");
    setMessage("");
    try {
      const res = await apiFetch(`/api/admin/hero-power-monitors/${monitor.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "删除失败");
        return;
      }
      setMessage(`已删除「${monitor.heroName}」监测项`);
      await loadMonitors();
    } catch {
      setError("网络错误，删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  if (!ready) {
    return <div className="p-8 text-center text-[var(--muted)]">校验登录…</div>;
  }

  return (
    <div className="fade-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--gold-bright)]">
            英雄战力监测
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            按英雄 + 区服添加监测项，每 {intervalHours} 小时采集一次分省省标及市标、县标最低门槛。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="btn btn-ghost !py-2" href="/hero-power">
            查看战力查询
          </Link>
          <Link className="btn btn-ghost !py-2" href="/admin">
            返回后台
          </Link>
        </div>
      </div>

      <form
        onSubmit={onAdd}
        className="panel grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_14rem_auto]"
      >
        <div>
          <label className="label">英雄</label>
          <select
            className="input"
            value={heroId}
            onChange={(event) => setHeroId(event.target.value)}
            disabled={adding || heroes.length === 0}
          >
            <option value="">{heroes.length ? "选择要监测的英雄" : "英雄列表加载中…"}</option>
            {heroes.map((hero) => (
              <option key={hero.ename} value={hero.ename}>
                {hero.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">区服</label>
          <select
            className="input"
            value={zone}
            onChange={(event) => setZone(event.target.value as PowerZone)}
            disabled={adding}
          >
            {ZONES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            className="btn btn-primary w-full sm:min-w-32"
            disabled={adding || !heroId}
          >
            {adding ? "添加并采集中…" : "添加监测"}
          </button>
        </div>
      </form>

      {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
      {message && <p className="text-sm text-[var(--teal)]">{message}</p>}

      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted)]">加载中…</div>
        ) : monitors.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)]">
            暂无监测英雄，请在上方添加。
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>英雄</th>
                <th>区服</th>
                <th>状态</th>
                <th>省 / 市 / 县最低战力</th>
                <th>最近采集</th>
                <th>下次采集</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {monitors.map((monitor) => {
                const nextSyncAt = monitor.lastAttemptAt
                  ? new Date(
                      new Date(monitor.lastAttemptAt).getTime() +
                        monitor.intervalHours * 60 * 60 * 1000,
                    )
                  : null;
                return (
                  <tr key={monitor.id}>
                    <td>
                      <div className="flex min-w-36 items-center gap-2">
                        {monitor.heroAvatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={monitor.heroAvatar}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/25 text-xs text-[var(--muted)]">
                            英雄
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="truncate font-medium">{monitor.heroName}</div>
                          <div className="truncate text-xs text-[var(--muted)]">
                            ID {monitor.heroId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-[var(--muted)]">{zoneLabel(monitor.zone)}</td>
                    <td>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          monitor.enabled
                            ? "border-[rgba(61,155,143,0.45)] text-[var(--teal)]"
                            : "border-[var(--line)] text-[var(--muted)]"
                        }`}
                      >
                        {monitor.enabled ? "采集中" : "已暂停"}
                      </span>
                    </td>
                    <td>
                      <span className="tabular-nums">
                        {formatPower(monitor.latest?.provincePower)}
                      </span>
                      <span className="mx-1.5 text-[var(--muted)]">/</span>
                      <span className="tabular-nums">
                        {formatPower(monitor.latest?.cityPower)}
                      </span>
                      <span className="mx-1.5 text-[var(--muted)]">/</span>
                      <span className="tabular-nums">
                        {formatPower(monitor.latest?.districtPower)}
                      </span>
                    </td>
                    <td className="text-[var(--muted)]">
                      {monitor.lastSyncedAt
                        ? format(new Date(monitor.lastSyncedAt), "MM-dd HH:mm")
                        : "—"}
                      {monitor.lastSyncError && (
                        <div
                          className="max-w-52 truncate text-xs text-[var(--crimson)]"
                          title={monitor.lastSyncError}
                        >
                          采集异常
                        </div>
                      )}
                    </td>
                    <td className="text-[var(--muted)]">
                      {monitor.enabled && nextSyncAt
                        ? format(nextSyncAt, "MM-dd HH:mm")
                        : "—"}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          className="btn btn-ghost !px-3 !py-1 text-xs"
                          onClick={() => onSync(monitor)}
                          disabled={syncingId === monitor.id}
                        >
                          {syncingId === monitor.id ? "采集中…" : "立即采集"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost !px-3 !py-1 text-xs"
                          onClick={() => onToggle(monitor)}
                          disabled={togglingId === monitor.id}
                        >
                          {togglingId === monitor.id
                            ? "更新中…"
                            : monitor.enabled
                              ? "暂停"
                              : "启用"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger !px-3 !py-1 text-xs"
                          onClick={() => onDelete(monitor)}
                          disabled={deletingId === monitor.id}
                        >
                          {deletingId === monitor.id ? "删除中…" : "删除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="panel p-4 text-sm text-[var(--muted)]">
        <p>
          自动采集在站点进程启动后生效；若部署环境不保证长期常驻进程，可配置外部 Cron 定时调用
          <code className="mx-1 rounded bg-black/25 px-1.5 py-0.5 text-xs">
            /api/cron/hero-power
          </code>
          。监测项按到期时间执行，不会因频繁调用重复记录。
        </p>
      </div>
    </div>
  );
}
