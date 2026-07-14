"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { ScoreTrendChart } from "@/components/score-trend-chart";
import { withBasePath } from "@/lib/base-path";

type History = {
  id: string;
  recordedAt: string;
  rankScore: number | null;
  peakRating: number | null;
  peakScore: number | null;
  source: string;
  note: string | null;
};

type HeroStat = {
  id: string;
  heroName: string;
  heroId: string | null;
  combatPower: number;
  games: number;
  wins: number;
};

type PowerHistory = {
  id: string;
  heroName: string;
  recordedAt: string;
  combatPower: number;
  source: string;
  note: string | null;
};

type Player = {
  id: string;
  gameNickname: string;
  campId: string;
  area: string;
  currentRank: string | null;
  currentStars: number;
  rankScore: number;
  peakRating: number;
  peakScore: number;
  seasonWins: number;
  seasonGames: number;
  mvpCount: number;
  goldCount: number;
  scoreHistories: History[];
  heroStats: HeroStat[];
  heroPowerHistories: PowerHistory[];
};

function toLocalInput(iso?: string) {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(local: string) {
  return new Date(local).toISOString();
}

export default function AdminPlayerEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const [player, setPlayer] = useState<Player | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [chartHero, setChartHero] = useState("");
  const [form, setForm] = useState({
    gameNickname: "",
    campId: "",
    area: "wechat",
    currentRank: "",
    currentStars: 0,
    rankScore: 0,
    peakRating: 0,
    peakScore: 0,
    seasonWins: 0,
    seasonGames: 0,
    mvpCount: 0,
    goldCount: 0,
    recordedAt: toLocalInput(),
    note: "",
  });
  const [histForm, setHistForm] = useState({
    recordedAt: toLocalInput(),
    rankScore: "",
    peakRating: "",
    peakScore: "",
    note: "",
  });
  const [powerForm, setPowerForm] = useState({
    heroName: "",
    combatPower: "",
    recordedAt: toLocalInput(),
    note: "",
  });

  async function load() {
    setError("");
    const res = await fetch(withBasePath(`/api/admin/players/${id}`));
    const json = await res.json();
    if (res.status === 401) {
      router.replace("/admin/login");
      return;
    }
    if (!json.ok) {
      setError(json.error || "加载失败");
      return;
    }
    const p = json.data.player as Player;
    setPlayer(p);
    setForm({
      gameNickname: p.gameNickname,
      campId: p.campId,
      area: p.area,
      currentRank: p.currentRank || "",
      currentStars: p.currentStars,
      rankScore: p.rankScore,
      peakRating: p.peakRating,
      peakScore: p.peakScore,
      seasonWins: p.seasonWins,
      seasonGames: p.seasonGames,
      mvpCount: p.mvpCount,
      goldCount: p.goldCount,
      recordedAt: toLocalInput(),
      note: "",
    });
    if (!chartHero && p.heroStats[0]) setChartHero(p.heroStats[0].heroName);
  }

  useEffect(() => {
    load().catch(() => setError("网络错误"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await fetch(withBasePath(`/api/admin/players/${id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameNickname: form.gameNickname,
          campId: form.campId,
          area: form.area,
          currentRank: form.currentRank || null,
          currentStars: form.currentStars,
          rankScore: form.rankScore,
          peakRating: form.peakRating,
          peakScore: form.peakScore,
          seasonWins: form.seasonWins,
          seasonGames: form.seasonGames,
          mvpCount: form.mvpCount,
          goldCount: form.goldCount,
          recordHistory: true,
          recordedAt: fromLocalInput(form.recordedAt),
          note: form.note || null,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "保存失败");
        return;
      }
      await load();
    } catch {
      setError("网络错误");
    } finally {
      setSaving(false);
    }
  }

  async function onAddHistory(e: FormEvent) {
    e.preventDefault();
    setError("");
    const payload = {
      recordedAt: fromLocalInput(histForm.recordedAt),
      rankScore: histForm.rankScore === "" ? null : Number(histForm.rankScore),
      peakRating: histForm.peakRating === "" ? null : Number(histForm.peakRating),
      peakScore: histForm.peakScore === "" ? null : Number(histForm.peakScore),
      note: histForm.note || null,
      applyToPlayer: true,
    };
    const res = await fetch(withBasePath(`/api/admin/players/${id}/history`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "添加失败");
      return;
    }
    setHistForm({
      recordedAt: toLocalInput(),
      rankScore: "",
      peakRating: "",
      peakScore: "",
      note: "",
    });
    await load();
  }

  async function onAddPower(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!powerForm.heroName.trim() || powerForm.combatPower === "") {
      setError("请填写英雄名称与战力");
      return;
    }
    const res = await fetch(withBasePath(`/api/admin/players/${id}/hero-power`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        heroName: powerForm.heroName.trim(),
        combatPower: Number(powerForm.combatPower),
        recordedAt: fromLocalInput(powerForm.recordedAt),
        note: powerForm.note || null,
        applyToStat: true,
      }),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "添加失败");
      return;
    }
    setChartHero(powerForm.heroName.trim());
    setPowerForm({
      heroName: powerForm.heroName,
      combatPower: "",
      recordedAt: toLocalInput(),
      note: "",
    });
    await load();
  }

  async function onDeleteHistory(hid: string) {
    if (!confirm("删除这条评分快照？")) return;
    const res = await fetch(withBasePath(`/api/admin/history/${hid}`), { method: "DELETE" });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "删除失败");
      return;
    }
    await load();
  }

  async function onDeletePowerHistory(hid: string) {
    if (!confirm("删除这条英雄战力快照？")) return;
    const res = await fetch(withBasePath(`/api/admin/hero-power-history/${hid}`), {
      method: "DELETE",
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "删除失败");
      return;
    }
    await load();
  }

  async function onDeleteHero(heroName: string) {
    if (!confirm(`删除英雄「${heroName}」的战力数据与历史？`)) return;
    const res = await fetch(
      withBasePath(`/api/admin/players/${id}/hero-power?hero=${encodeURIComponent(heroName)}`),
      { method: "DELETE" },
    );
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "删除失败");
      return;
    }
    if (chartHero === heroName) setChartHero("");
    await load();
  }

  const histories = player?.scoreHistories || [];
  const heroStats = player?.heroStats || [];
  const powerHistories = player?.heroPowerHistories || [];

  const rankSeries = useMemo(
    () =>
      [...histories]
        .filter((h) => h.rankScore != null)
        .reverse()
        .map((h) => ({
          t: h.recordedAt,
          value: h.rankScore as number,
          source: h.source,
        })),
    [histories],
  );
  const peakRatingSeries = useMemo(
    () =>
      [...histories]
        .filter((h) => h.peakRating != null)
        .reverse()
        .map((h) => ({
          t: h.recordedAt,
          value: h.peakRating as number,
          source: h.source,
        })),
    [histories],
  );
  const peakScoreSeries = useMemo(
    () =>
      [...histories]
        .filter((h) => h.peakScore != null)
        .reverse()
        .map((h) => ({
          t: h.recordedAt,
          value: h.peakScore as number,
          source: h.source,
        })),
    [histories],
  );
  const powerSeries = useMemo(() => {
    if (!chartHero) return [];
    return [...powerHistories]
      .filter((h) => h.heroName === chartHero)
      .reverse()
      .map((h) => ({
        t: h.recordedAt,
        value: h.combatPower,
        source: h.source,
      }));
  }, [powerHistories, chartHero]);

  if (!player && !error) {
    return <div className="p-8 text-center text-[var(--muted)]">加载中…</div>;
  }

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-[var(--muted)] hover:text-[var(--gold)]">
            ← 返回列表
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[var(--gold-bright)]">
            编辑玩家 {player?.gameNickname || ""}
          </h1>
        </div>
        {player && (
          <Link
            href={`/p/${encodeURIComponent(player.gameNickname)}`}
            className="btn btn-ghost !py-2"
          >
            查看前台页
          </Link>
        )}
      </div>

      {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}

      {player && (
        <>
          <form onSubmit={onSave} className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="label">王者名称</label>
              <input
                className="input"
                required
                value={form.gameNickname}
                onChange={(e) => setForm({ ...form, gameNickname: e.target.value })}
              />
            </div>
            <div>
              <label className="label">营地 ID</label>
              <input
                className="input"
                required
                value={form.campId}
                onChange={(e) => setForm({ ...form, campId: e.target.value })}
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
              <label className="label">赛季胜场 / 场次</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.seasonWins}
                  onChange={(e) => setForm({ ...form, seasonWins: Number(e.target.value) || 0 })}
                />
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={form.seasonGames}
                  onChange={(e) => setForm({ ...form, seasonGames: Number(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div>
              <label className="label">录入时间（评分曲线横轴）</label>
              <input
                className="input"
                type="datetime-local"
                value={form.recordedAt}
                onChange={(e) => setForm({ ...form, recordedAt: e.target.value })}
              />
            </div>
            <div>
              <label className="label">备注</label>
              <input
                className="input"
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? "保存中…" : "保存并写入评分快照"}
              </button>
            </div>
          </form>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="panel p-4">
              <h2 className="mb-2 text-sm text-[var(--muted)]">排位评分曲线</h2>
              <ScoreTrendChart data={rankSeries} metric="rankScore" height={180} />
            </div>
            <div className="panel p-4">
              <h2 className="mb-2 text-sm text-[var(--muted)]">巅峰评分曲线</h2>
              <ScoreTrendChart data={peakRatingSeries} metric="peakRating" height={180} />
            </div>
            <div className="panel p-4">
              <h2 className="mb-2 text-sm text-[var(--muted)]">巅峰分曲线</h2>
              <ScoreTrendChart data={peakScoreSeries} metric="peakScore" height={180} />
            </div>
          </div>

          <div className="panel space-y-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg text-[var(--gold-bright)]">英雄战力</h2>
                <p className="text-sm text-[var(--muted)]">
                  战力按英雄维护；同步战绩时会保留已录入的英雄战力。
                </p>
              </div>
              <select
                className="input !w-auto"
                value={chartHero}
                onChange={(e) => setChartHero(e.target.value)}
              >
                <option value="">选择英雄看曲线</option>
                {heroStats.map((h) => (
                  <option key={h.id} value={h.heroName}>
                    {h.heroName}（{h.combatPower}）
                  </option>
                ))}
              </select>
            </div>
            <ScoreTrendChart data={powerSeries} metric="combatPower" height={200} />

            <form
              onSubmit={onAddPower}
              className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-2 lg:grid-cols-5"
            >
              <div>
                <label className="label">英雄名称</label>
                <input
                  className="input"
                  list="hero-options"
                  value={powerForm.heroName}
                  onChange={(e) => setPowerForm({ ...powerForm, heroName: e.target.value })}
                  placeholder="如 李白"
                  required
                />
                <datalist id="hero-options">
                  {heroStats.map((h) => (
                    <option key={h.id} value={h.heroName} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label">战力</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={powerForm.combatPower}
                  onChange={(e) => setPowerForm({ ...powerForm, combatPower: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="label">录入时间</label>
                <input
                  className="input"
                  type="datetime-local"
                  value={powerForm.recordedAt}
                  onChange={(e) => setPowerForm({ ...powerForm, recordedAt: e.target.value })}
                />
              </div>
              <div>
                <label className="label">备注</label>
                <input
                  className="input"
                  value={powerForm.note}
                  onChange={(e) => setPowerForm({ ...powerForm, note: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn btn-primary w-full">
                  写入英雄战力
                </button>
              </div>
            </form>

            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>英雄</th>
                    <th>当前战力</th>
                    <th>场次</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {heroStats.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-[var(--muted)]">
                        暂无英雄战力，可在上方录入
                      </td>
                    </tr>
                  ) : (
                    heroStats.map((h) => (
                      <tr key={h.id}>
                        <td>{h.heroName}</td>
                        <td className="text-[var(--gold-bright)]">{h.combatPower}</td>
                        <td className="text-[var(--muted)]">{h.games}</td>
                        <td>
                          <div className="flex gap-2">
                            <button
                              className="btn btn-ghost !px-3 !py-1 text-xs"
                              type="button"
                              onClick={() => {
                                setChartHero(h.heroName);
                                setPowerForm({
                                  ...powerForm,
                                  heroName: h.heroName,
                                  combatPower: String(h.combatPower || ""),
                                });
                              }}
                            >
                              编辑
                            </button>
                            <button
                              className="btn btn-danger !px-3 !py-1 text-xs"
                              type="button"
                              onClick={() => onDeleteHero(h.heroName)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="overflow-x-auto border-t border-[var(--line)] pt-4">
              <h3 className="mb-2 text-sm text-[var(--muted)]">英雄战力历史</h3>
              <table className="table">
                <thead>
                  <tr>
                    <th>录入时间</th>
                    <th>英雄</th>
                    <th>战力</th>
                    <th>来源</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {powerHistories.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-[var(--muted)]">
                        暂无历史
                      </td>
                    </tr>
                  ) : (
                    powerHistories.slice(0, 30).map((h) => (
                      <tr key={h.id}>
                        <td>{format(new Date(h.recordedAt), "yyyy-MM-dd HH:mm")}</td>
                        <td>{h.heroName}</td>
                        <td>{h.combatPower}</td>
                        <td className="text-[var(--muted)]">
                          {h.source === "sync" ? "同步" : "手动"}
                        </td>
                        <td>
                          <button
                            className="btn btn-danger !px-3 !py-1 text-xs"
                            onClick={() => onDeletePowerHistory(h.id)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <form
            onSubmit={onAddHistory}
            className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <div className="lg:col-span-4">
              <h2 className="text-lg text-[var(--gold-bright)]">追加评分快照</h2>
              <p className="text-sm text-[var(--muted)]">
                排位评分 / 巅峰评分 / 巅峰分；英雄战力请用上方表单。
              </p>
            </div>
            <div>
              <label className="label">录入时间</label>
              <input
                className="input"
                type="datetime-local"
                value={histForm.recordedAt}
                onChange={(e) => setHistForm({ ...histForm, recordedAt: e.target.value })}
              />
            </div>
            <div>
              <label className="label">排位评分（0–110）</label>
              <input
                className="input"
                type="number"
                min={0}
                max={110}
                value={histForm.rankScore}
                onChange={(e) => setHistForm({ ...histForm, rankScore: e.target.value })}
              />
            </div>
            <div>
              <label className="label">巅峰评分（0–110）</label>
              <input
                className="input"
                type="number"
                min={0}
                max={110}
                value={histForm.peakRating}
                onChange={(e) => setHistForm({ ...histForm, peakRating: e.target.value })}
              />
            </div>
            <div>
              <label className="label">巅峰分</label>
              <input
                className="input"
                type="number"
                min={0}
                value={histForm.peakScore}
                onChange={(e) => setHistForm({ ...histForm, peakScore: e.target.value })}
              />
            </div>
            <div>
              <label className="label">备注</label>
              <input
                className="input"
                value={histForm.note}
                onChange={(e) => setHistForm({ ...histForm, note: e.target.value })}
              />
            </div>
            <div className="lg:col-span-4">
              <button type="submit" className="btn btn-primary">
                追加快照
              </button>
            </div>
          </form>

          <div className="panel overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>录入时间</th>
                  <th>排位评分</th>
                  <th>巅峰评分</th>
                  <th>巅峰分</th>
                  <th>来源</th>
                  <th>备注</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {histories.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center text-[var(--muted)]">
                      暂无快照
                    </td>
                  </tr>
                ) : (
                  histories.map((h) => (
                    <tr key={h.id}>
                      <td>{format(new Date(h.recordedAt), "yyyy-MM-dd HH:mm")}</td>
                      <td>{h.rankScore ?? "-"}</td>
                      <td>{h.peakRating ?? "-"}</td>
                      <td>{h.peakScore ?? "-"}</td>
                      <td className="text-[var(--muted)]">
                        {h.source === "sync" ? "同步" : "手动"}
                      </td>
                      <td className="text-[var(--muted)]">{h.note || "-"}</td>
                      <td>
                        <button
                          className="btn btn-danger !px-3 !py-1 text-xs"
                          onClick={() => onDeleteHistory(h.id)}
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
