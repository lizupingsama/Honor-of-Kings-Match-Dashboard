"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { withBasePath } from "@/lib/base-path";

type PlayerRow = {
  id: string;
  gameNickname: string;
  area: string;
  currentRank: string | null;
  currentStars: number;
  rankScore: number;
  peakRating: number;
  peakScore: number;
  seasonGames: number;
  seasonWins: number;
  updatedAt: string;
  _count: { matches: number; scoreHistories: number; heroStats: number };
};

type CampAuthStatus = {
  loggedIn: boolean;
  userId?: string;
  nickname?: string;
  lastLoginAt?: string;
  expires?: string;
};

type SyncSummary = {
  synced: number;
  ok: number;
  failed: number;
};

const emptyForm = {
  gameNickname: "",
  area: "wechat",
  currentRank: "",
  currentStars: 0,
  rankScore: 0,
  peakRating: 0,
  peakScore: 0,
  seasonWins: 0,
  seasonGames: 0,
};

export default function AdminPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [campAuth, setCampAuth] = useState<CampAuthStatus | null>(null);
  const [campLoading, setCampLoading] = useState(false);
  const [qrTaskId, setQrTaskId] = useState<string | null>(null);
  const [qrcodeBase64, setQrcodeBase64] = useState<string | null>(null);
  const [qrStatus, setQrStatus] = useState("");
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncSummary, setSyncSummary] = useState<SyncSummary | null>(null);
  const [syncMessage, setSyncMessage] = useState("");

  const load = useCallback(async (query = q) => {
    setLoading(true);
    setError("");
    try {
      const qs = new URLSearchParams();
      if (query.trim()) qs.set("q", query.trim());
      const res = await fetch(withBasePath(`/api/admin/players?${qs}`));
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!json.ok) {
        setError(json.error || "加载失败");
        return;
      }
      setPlayers(json.data.players || []);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }, [q, router]);

  const loadCampAuth = useCallback(async () => {
    try {
      const res = await fetch(withBasePath("/api/admin/camp-auth"));
      const json = await res.json();
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (json.ok) setCampAuth(json.data);
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    fetch(withBasePath("/api/admin/auth"))
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
    if (ready) {
      load("");
      loadCampAuth();
    }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!qrTaskId) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          withBasePath(`/api/admin/camp-auth/qr?taskId=${encodeURIComponent(qrTaskId)}`),
        );
        const json = await res.json();
        if (cancelled || !json.ok) return;
        const status = json.data.status as string;
        if (status === "waiting") {
          setQrStatus("等待扫码…");
        } else if (status === "scanned") {
          setQrStatus("已扫码，请在手机上确认登录");
        } else if (status === "success") {
          setQrStatus("登录成功");
          setCampAuth(json.data.auth);
          setQrTaskId(null);
          setQrcodeBase64(null);
          setCampLoading(false);
        } else if (status === "expired") {
          setQrStatus("二维码已过期，请重新获取");
          setQrTaskId(null);
          setQrcodeBase64(null);
          setCampLoading(false);
        } else if (status === "canceled") {
          setQrStatus("已取消登录");
          setQrTaskId(null);
          setQrcodeBase64(null);
          setCampLoading(false);
        } else if (status === "error") {
          setQrStatus(json.data.message || "登录失败");
          setCampLoading(false);
        }
      } catch {
        // ignore transient errors
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [qrTaskId]);

  async function startCampLogin() {
    setCampLoading(true);
    setQrStatus("正在获取二维码…");
    setError("");
    try {
      const res = await fetch(withBasePath("/api/admin/camp-auth/qr"), { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "获取二维码失败");
        setQrStatus("");
        setCampLoading(false);
        return;
      }
      setQrTaskId(json.data.taskId);
      setQrcodeBase64(json.data.qrcodeBase64);
      setQrStatus("请使用微信扫描二维码登录王者营地");
    } catch {
      setError("网络错误");
      setQrStatus("");
      setCampLoading(false);
    }
  }

  async function clearCampLogin() {
    if (!confirm("确认清除营地登录态？清除后将无法同步战绩，需重新扫码。")) return;
    setCampLoading(true);
    try {
      const res = await fetch(withBasePath("/api/admin/camp-auth"), { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "清除失败");
        return;
      }
      setCampAuth({ loggedIn: false });
      setQrTaskId(null);
      setQrcodeBase64(null);
      setQrStatus("");
    } catch {
      setError("网络错误");
    } finally {
      setCampLoading(false);
    }
  }

  async function syncAll() {
    if (!confirm("确认刷新所有玩家数据？玩家之间会间隔 5 秒，账号较多时会等待较久。")) {
      return;
    }
    setSyncingAll(true);
    setSyncSummary(null);
    setSyncMessage("正在刷新所有玩家，请不要重复点击…");
    setError("");
    try {
      const res = await fetch(withBasePath("/api/admin/sync-all"), { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setSyncMessage(json.error || "刷新失败");
        return;
      }
      setSyncSummary({
        synced: json.data.synced ?? 0,
        ok: json.data.ok ?? 0,
        failed: json.data.failed ?? 0,
      });
      setSyncMessage("刷新完成");
      await load();
    } catch {
      setSyncMessage("网络错误");
    } finally {
      setSyncingAll(false);
    }
  }

  async function logout() {
    await fetch(withBasePath("/api/admin/auth"), { method: "DELETE" });
    router.replace("/admin/login");
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    try {
      const res = await fetch(withBasePath("/api/admin/players"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          currentRank: form.currentRank || null,
          recordHistory: true,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "创建失败");
        return;
      }
      setForm(emptyForm);
      setShowCreate(false);
      await load();
    } catch {
      setError("网络错误");
    } finally {
      setCreating(false);
    }
  }

  async function onDelete(id: string, name: string) {
    if (!confirm(`确认删除玩家「${name}」及其全部对局与评分历史？`)) return;
    const res = await fetch(withBasePath(`/api/admin/players/${id}`), { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "删除失败");
      return;
    }
    await load();
  }

  if (!ready) {
    return <div className="p-8 text-center text-[var(--muted)]">校验登录…</div>;
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--gold-bright)]">管理后台</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            手动增加、修改、删除玩家数据；改评分会写入历史快照供排行榜曲线使用。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost !py-2" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? "收起表单" : "新增玩家"}
          </button>
          <button className="btn btn-ghost !py-2" onClick={logout}>
            退出
          </button>
        </div>
      </div>

      <div className="panel space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-[var(--gold-bright)]">营地登录</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              战绩同步依赖王者营地登录态。请用微信扫码登录后，首页即可用营地 ID 查询。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn btn-primary !py-2"
              onClick={startCampLogin}
              disabled={campLoading}
            >
              {campAuth?.loggedIn ? "重新扫码" : "微信扫码登录"}
            </button>
            {campAuth?.loggedIn && (
              <button
                className="btn btn-ghost !py-2"
                onClick={clearCampLogin}
                disabled={campLoading}
              >
                清除登录态
              </button>
            )}
            <button
              className="btn btn-ghost !py-2"
              onClick={syncAll}
              disabled={syncingAll || !campAuth?.loggedIn}
              title={!campAuth?.loggedIn ? "请先登录营地" : undefined}
            >
              {syncingAll ? "刷新中…" : "刷新所有玩家"}
            </button>
          </div>
        </div>

        {campAuth?.loggedIn ? (
          <p className="text-sm text-[var(--muted)]">
            已登录
            {campAuth.nickname ? ` · ${campAuth.nickname}` : ""}
            {campAuth.userId ? ` · ID ${campAuth.userId}` : ""}
            {campAuth.lastLoginAt
              ? ` · ${format(new Date(campAuth.lastLoginAt), "yyyy-MM-dd HH:mm")}`
              : ""}
          </p>
        ) : (
          <p className="text-sm text-[var(--crimson)]">未登录营地，查询战绩前请先扫码。</p>
        )}

        {qrcodeBase64 && (
          <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`data:image/png;base64,${qrcodeBase64}`}
              alt="营地登录二维码"
              className="h-44 w-44 rounded-lg border border-[var(--line)] bg-white p-2"
            />
            <p className="text-sm text-[var(--muted)]">{qrStatus}</p>
          </div>
        )}
        {!qrcodeBase64 && qrStatus && (
          <p className="text-sm text-[var(--muted)]">{qrStatus}</p>
        )}
        {syncMessage && (
          <p className="text-sm text-[var(--muted)]">
            {syncMessage}
            {syncSummary
              ? `：成功 ${syncSummary.ok} / ${syncSummary.synced}，失败 ${syncSummary.failed}`
              : ""}
          </p>
        )}
      </div>

      {showCreate && (
        <form onSubmit={onCreate} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">王者名称 *</label>
            <input
              className="input"
              required
              value={form.gameNickname}
              onChange={(e) => setForm({ ...form, gameNickname: e.target.value })}
            />
          </div>
          <div>
            <label className="label">区服</label>
            <select
              className="input"
              value={form.area}
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            >
              <option value="wechat">微信</option>
              <option value="qq">QQ</option>
            </select>
          </div>
          <div>
            <label className="label">当前段位</label>
            <input
              className="input"
              placeholder="如 王者 / 星耀I"
              value={form.currentRank}
              onChange={(e) => setForm({ ...form, currentRank: e.target.value })}
            />
          </div>
          <div>
            <label className="label">星数</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.currentStars}
              onChange={(e) => setForm({ ...form, currentStars: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">排位评分（0–110）</label>
            <input
              className="input"
              type="number"
              min={0}
              max={110}
              value={form.rankScore}
              onChange={(e) => setForm({ ...form, rankScore: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">巅峰评分（0–110）</label>
            <input
              className="input"
              type="number"
              min={0}
              max={110}
              value={form.peakRating}
              onChange={(e) => setForm({ ...form, peakRating: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">巅峰分</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.peakScore}
              onChange={(e) => setForm({ ...form, peakScore: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">赛季胜场</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.seasonWins}
              onChange={(e) => setForm({ ...form, seasonWins: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label">赛季场次</label>
            <input
              className="input"
              type="number"
              min={0}
              value={form.seasonGames}
              onChange={(e) => setForm({ ...form, seasonGames: Number(e.target.value) || 0 })}
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? "创建中…" : "创建并写入快照"}
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          className="input !w-auto min-w-[200px] flex-1"
          placeholder="搜索王者名称 / 营地 ID"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") load();
          }}
        />
        <button className="btn btn-ghost !py-2" onClick={() => load()}>
          搜索
        </button>
      </div>

      {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}

      <div className="panel overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-[var(--muted)]">加载中…</div>
        ) : players.length === 0 ? (
          <div className="p-8 text-center text-[var(--muted)]">暂无玩家</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>王者名称</th>
                <th>区服</th>
                <th>排位评分</th>
                <th>巅峰评分</th>
                <th>巅峰分</th>
                <th>英雄数</th>
                <th>快照</th>
                <th>更新</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link
                      href={`/admin/players/${p.id}`}
                      className="hover:text-[var(--gold-bright)]"
                    >
                      {p.gameNickname}
                    </Link>
                  </td>
                  <td className="text-[var(--muted)]">
                    {p.area === "qq" ? "QQ" : "微信"}
                  </td>
                  <td>{p.rankScore}</td>
                  <td>{p.peakRating}</td>
                  <td>{p.peakScore}</td>
                  <td className="text-[var(--muted)]">{p._count.heroStats}</td>
                  <td className="text-[var(--muted)]">{p._count.scoreHistories}</td>
                  <td className="text-[var(--muted)]">
                    {format(new Date(p.updatedAt), "MM-dd HH:mm")}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/players/${p.id}`}
                        className="btn btn-ghost !px-3 !py-1 text-xs"
                      >
                        编辑
                      </Link>
                      <button
                        className="btn btn-danger !px-3 !py-1 text-xs"
                        onClick={() => onDelete(p.id, p.gameNickname)}
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
