"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { apiFetch } from "@/lib/client-fetch";

type Stats = {
  total: number;
  uniqueIps: number;
  todayPv: number;
  todayUv: number;
  max: number;
};

type IpRow = {
  ip: string;
  geo: string | null;
  count: number;
  firstAt: string;
  lastAt: string;
  lastPath: string | null;
  lastUserAgent: string | null;
};

type VisitRow = {
  id: number;
  ip: string;
  path: string;
  userAgent: string | null;
  referer: string | null;
  createdAt: string;
};

const fmt = (v: string) => format(new Date(v), "MM-dd HH:mm:ss");

export default function AdminVisitsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [stats, setStats] = useState<Stats | null>(null);
  const [ips, setIps] = useState<IpRow[]>([]);
  const [ipsTotal, setIpsTotal] = useState(0);
  const [recent, setRecent] = useState<VisitRow[]>([]);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "count">("recent");
  const [page, setPage] = useState(1);
  const [detailIp, setDetailIp] = useState("");
  const [clearing, setClearing] = useState(false);
  /** beacon=真实访客（浏览器 JS 上报）；server=到源站的全部请求（含爬虫扫描器） */
  const [view, setView] = useState<"beacon" | "server">("beacon");

  const load = useCallback(
    async (opts?: {
      q?: string;
      sort?: string;
      page?: number;
      ip?: string;
      view?: string;
    }) => {
      setLoading(true);
      setError("");
      try {
        const qs = new URLSearchParams();
        const query = opts?.q ?? q;
        const s = opts?.sort ?? sort;
        const p = opts?.page ?? page;
        const ip = opts?.ip ?? detailIp;
        qs.set("source", opts?.view ?? view);
        if (query.trim()) qs.set("q", query.trim());
        qs.set("sort", s);
        qs.set("page", String(p));
        if (ip) qs.set("ip", ip);
        const res = await apiFetch(`/api/admin/visits?${qs}`);
        if (res.status === 401) {
          router.replace("/admin/login");
          return;
        }
        const json = await res.json();
        if (!json.ok) {
          setError(json.error || "加载失败");
          return;
        }
        setStats(json.data.stats);
        setIps(json.data.ips || []);
        setIpsTotal(json.data.ipsTotal || 0);
        setRecent(json.data.recent || []);
      } catch {
        setError("网络错误");
      } finally {
        setLoading(false);
      }
    },
    [q, sort, page, detailIp, view, router],
  );

  useEffect(() => {
    apiFetch("/api/admin/auth")
      .then((r) => r.json())
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
    if (ready) load();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  function onSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setDetailIp("");
    load({ page: 1, ip: "" });
  }

  function switchSort(s: "recent" | "count") {
    if (s === sort) return;
    setSort(s);
    setPage(1);
    load({ sort: s, page: 1 });
  }

  function switchView(v: "beacon" | "server") {
    if (v === view) return;
    setView(v);
    setPage(1);
    setDetailIp("");
    load({ view: v, page: 1, ip: "" });
  }

  function gotoPage(p: number) {
    setPage(p);
    load({ page: p });
  }

  function showDetail(ip: string) {
    const next = detailIp === ip ? "" : ip;
    setDetailIp(next);
    load({ ip: next });
  }

  async function clearAll() {
    if (!confirm("确认清空全部访问记录？该操作不可恢复。")) return;
    setClearing(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/visits", { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "清空失败");
        return;
      }
      setPage(1);
      setDetailIp("");
      load({ page: 1, ip: "" });
    } catch {
      setError("网络错误");
    } finally {
      setClearing(false);
    }
  }

  if (!ready) {
    return <p className="py-16 text-center text-sm text-[var(--muted)]">验证登录中…</p>;
  }

  const totalPages = Math.max(1, Math.ceil(ipsTotal / 20));

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--gold-bright)]">IP 统计</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            记录访客真实 IP（经 CDN 还原），滚动保留最近 {(stats?.max ?? 100000).toLocaleString()} 条。
            {view === "beacon"
              ? "当前视图：真实访客——浏览器执行 JS 上报，爬虫扫描器基本进不来。"
              : "当前视图：全部请求——凡到达源站的页面请求都算，包含爬虫与扫描器。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1">
            <button
              className={`btn !py-2 ${view === "beacon" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => switchView("beacon")}
            >
              真实访客
            </button>
            <button
              className={`btn !py-2 ${view === "server" ? "btn-primary" : "btn-ghost"}`}
              onClick={() => switchView("server")}
            >
              全部请求
            </button>
          </div>
          <Link className="btn btn-ghost !py-2" href="/admin">
            返回后台
          </Link>
          <button className="btn btn-ghost !py-2" onClick={() => load()} disabled={loading}>
            {loading ? "刷新中…" : "刷新"}
          </button>
          <button className="btn btn-ghost !py-2" onClick={clearAll} disabled={clearing}>
            清空记录
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "总记录", value: stats?.total },
          { label: "独立 IP", value: stats?.uniqueIps },
          { label: "今日访问", value: stats?.todayPv },
          { label: "今日独立 IP", value: stats?.todayUv },
        ].map((c) => (
          <div key={c.label} className="panel p-4">
            <p className="text-sm text-[var(--muted)]">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--gold-bright)]">
              {c.value != null ? c.value.toLocaleString() : "–"}
            </p>
          </div>
        ))}
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-[var(--gold-bright)]">按 IP 汇总</h2>
          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={onSearch} className="flex items-center gap-2">
              <input
                className="input !py-1.5"
                placeholder="搜索 IP"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="btn btn-ghost !py-1.5" type="submit">
                搜索
              </button>
            </form>
            <div className="flex gap-1">
              <button
                className={`btn !py-1.5 ${sort === "recent" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => switchSort("recent")}
              >
                按最近访问
              </button>
              <button
                className={`btn !py-1.5 ${sort === "count" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => switchSort("count")}
              >
                按次数
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>IP</th>
                <th>归属地</th>
                <th>次数</th>
                <th>最近访问</th>
                <th>首次访问</th>
                <th>最近路径</th>
                <th>最近 UA</th>
              </tr>
            </thead>
            <tbody>
              {ips.map((row) => (
                <tr
                  key={row.ip}
                  className={`cursor-pointer ${detailIp === row.ip ? "bg-[var(--line)]/30" : ""}`}
                  onClick={() => showDetail(row.ip)}
                  title="点击查看该 IP 的访问明细"
                >
                  <td className="font-mono">{row.ip}</td>
                  <td className="max-w-[12rem] truncate text-[var(--muted)]" title={row.geo || undefined}>
                    {row.geo || "–"}
                  </td>
                  <td>{row.count.toLocaleString()}</td>
                  <td className="text-[var(--muted)]">{fmt(row.lastAt)}</td>
                  <td className="text-[var(--muted)]">{fmt(row.firstAt)}</td>
                  <td className="max-w-[16rem] truncate text-[var(--muted)]">
                    {row.lastPath || "–"}
                  </td>
                  <td className="max-w-[20rem] truncate text-[var(--muted)]">
                    {row.lastUserAgent || "–"}
                  </td>
                </tr>
              ))}
              {!ips.length && !loading && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[var(--muted)]">
                    暂无记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-end gap-2 text-sm">
            <button
              className="btn btn-ghost !py-1"
              disabled={page <= 1 || loading}
              onClick={() => gotoPage(page - 1)}
            >
              上一页
            </button>
            <span className="text-[var(--muted)]">
              {page} / {totalPages}（{ipsTotal.toLocaleString()} 个 IP）
            </span>
            <button
              className="btn btn-ghost !py-1"
              disabled={page >= totalPages || loading}
              onClick={() => gotoPage(page + 1)}
            >
              下一页
            </button>
          </div>
        )}
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-[var(--gold-bright)]">
            {detailIp ? `明细 · ${detailIp}` : "最近访问明细"}
          </h2>
          {detailIp && (
            <button className="btn btn-ghost !py-1.5" onClick={() => showDetail(detailIp)}>
              显示全部
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>时间</th>
                <th>IP</th>
                <th>路径</th>
                <th>来源页</th>
                <th>UA</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id}>
                  <td className="whitespace-nowrap text-[var(--muted)]">{fmt(v.createdAt)}</td>
                  <td className="font-mono">{v.ip}</td>
                  <td className="max-w-[14rem] truncate">{v.path}</td>
                  <td className="max-w-[14rem] truncate text-[var(--muted)]">
                    {v.referer || "–"}
                  </td>
                  <td className="max-w-[18rem] truncate text-[var(--muted)]">
                    {v.userAgent || "–"}
                  </td>
                </tr>
              ))}
              {!recent.length && !loading && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[var(--muted)]">
                    暂无记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
