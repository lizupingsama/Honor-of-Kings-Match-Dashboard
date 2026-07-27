"use client";

import { useEffect, useMemo, useState } from "react";
import type { HeroMeta, PowerQueryResult, PowerZone, RankItem } from "@/lib/hero-power-api";
import { apiFetch } from "@/lib/client-fetch";

const ZONES: { value: PowerZone; label: string }[] = [
  { value: "aqq", label: "安卓 QQ" },
  { value: "awx", label: "安卓 微信" },
  { value: "iqq", label: "iOS QQ" },
  { value: "iwx", label: "iOS 微信" },
];

const LEVEL_TABS = [
  { key: "province", label: "省标" },
  { key: "city", label: "市标" },
  { key: "district", label: "县标" },
] as const;

const RECENT_KEY = "wzry-hero-power-recent";
const RECENT_MAX = 8;
const CHIP_LIMIT = 24;

type LevelKey = (typeof LEVEL_TABS)[number]["key"];

function filterByLevel(list: RankItem[], level: LevelKey) {
  return list
    .filter((r) => r.level === level)
    .slice()
    .sort((a, b) => a.rank - b.rank);
}

function loadRecentIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.map(String).filter(Boolean).slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

function pushRecentId(ename: string) {
  const id = ename.trim();
  if (!id) return;
  const next = [id, ...loadRecentIds().filter((x) => x !== id)].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  return next;
}

export default function HeroPowerPage() {
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [heroesError, setHeroesError] = useState("");
  const [heroQuery, setHeroQuery] = useState("");
  const [heroId, setHeroId] = useState("");
  const [zone, setZone] = useState<PowerZone>("aqq");
  const [level, setLevel] = useState<LevelKey>("province");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<PowerQueryResult | null>(null);
  const [regionFilter, setRegionFilter] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    setRecentIds(loadRecentIds());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/hero-power/heroes");
        const json = await res.json();
        if (!json.ok) {
          if (!cancelled) setHeroesError(json.error || "加载英雄列表失败");
          return;
        }
        if (!cancelled) setHeroes(json.data.list as HeroMeta[]);
      } catch {
        if (!cancelled) setHeroesError("网络错误，无法加载英雄列表");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredHeroes = useMemo(() => {
    const byId = new Map(heroes.map((h) => [h.ename, h]));
    const recent = recentIds.map((id) => byId.get(id)).filter((h): h is HeroMeta => Boolean(h));
    const q = heroQuery.trim().toLowerCase();

    if (q) {
      const matched = heroes.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.title.toLowerCase().includes(q) ||
          h.ename.includes(q),
      );
      const recentMatched = recent.filter((h) => matched.some((m) => m.ename === h.ename));
      const rest = matched.filter((h) => !recentMatched.some((r) => r.ename === h.ename));
      return [...recentMatched, ...rest].slice(0, 36);
    }

    const recentSet = new Set(recent.map((h) => h.ename));
    const rest = heroes.filter((h) => !recentSet.has(h.ename));
    return [...recent, ...rest].slice(0, CHIP_LIMIT);
  }, [heroes, heroQuery, recentIds]);

  const selectedHero = useMemo(
    () => heroes.find((h) => h.ename === heroId) || null,
    [heroes, heroId],
  );

  const rows = useMemo(() => {
    if (!result) return [];
    const base = filterByLevel(result.list, level);
    const q = regionFilter.trim();
    if (!q) return base;
    return base.filter((r) => r.address.includes(q));
  }, [result, level, regionFilter]);

  async function onQuery(e?: React.FormEvent) {
    e?.preventDefault();
    const name = heroQuery.trim();
    let id = heroId;
    if (!id && name) {
      const exact = heroes.find((h) => h.name === name);
      if (exact) id = exact.ename;
    }
    if (!id && !name) {
      setError("请选择或输入英雄");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ zone, type: "all" });
      if (id) params.set("heroId", id);
      else params.set("hero", name);

      const res = await apiFetch(`/api/hero-power/query?${params}`);
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "查询失败");
        setResult(null);
        return;
      }
      const data = json.data as PowerQueryResult;
      setResult(data);
      if (data.hero.ename) setHeroId(data.hero.ename);
      if (data.hero.name) setHeroQuery(data.hero.name);
      if (data.hero.ename) {
        const next = pushRecentId(data.hero.ename);
        if (next) setRecentIds(next);
      }
      setRegionFilter("");
    } catch {
      setError("网络错误");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function pickHero(h: HeroMeta) {
    setHeroId(h.ename);
    setHeroQuery(h.name);
  }

  const minRow = rows.length
    ? rows.reduce((best, r) => (r.rank < best.rank ? r : best))
    : null;
  const maxRow = rows.length
    ? rows.reduce((best, r) => (r.rank > best.rank ? r : best))
    : null;

  const recentSet = useMemo(() => new Set(recentIds), [recentIds]);
  const chipLabel = heroQuery.trim()
    ? "匹配英雄"
    : recentIds.length
      ? "最近搜索 / 常用英雄"
      : "常用英雄";

  return (
    <div className="space-y-8">
      <section className="fade-in panel relative overflow-hidden px-5 py-8 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-35"
          style={{
            background:
              "radial-gradient(ellipse at 80% 20%, rgba(212,175,106,0.22), transparent 50%), radial-gradient(ellipse at 10% 90%, rgba(61,155,143,0.16), transparent 45%)",
          }}
        />
        <div className="relative">
          <h1
            className="text-3xl text-[var(--gold-bright)] sm:text-4xl"
            style={{ fontFamily: "var(--font-title), serif" }}
          >
            英雄战力查询
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            查询指定英雄在各区服的省标 / 市标 / 县标战力门槛（全国分布数据，按日更新）。
          </p>

          <form onSubmit={onQuery} className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <div>
              <label className="label">英雄</label>
              <input
                className="input"
                value={heroQuery}
                onChange={(e) => {
                  setHeroQuery(e.target.value);
                  setHeroId("");
                }}
                placeholder="输入名称，如：赵云"
                list="hero-power-datalist"
                autoComplete="off"
              />
              <datalist id="hero-power-datalist">
                {heroes.map((h) => (
                  <option key={h.ename} value={h.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="label">区服</label>
              <select
                className="input min-w-36"
                value={zone}
                onChange={(e) => setZone(e.target.value as PowerZone)}
              >
                {ZONES.map((z) => (
                  <option key={z.value} value={z.value}>
                    {z.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button className="btn btn-primary w-full sm:min-w-28" disabled={loading}>
                {loading ? "查询中…" : "查询战力"}
              </button>
            </div>
          </form>

          {heroesError && <p className="mt-3 text-sm text-[var(--crimson)]">{heroesError}</p>}
          {error && <p className="mt-3 text-sm text-[var(--crimson)]">{error}</p>}

          {!heroesError && heroes.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-xs text-[var(--muted)]">{chipLabel} · 点击选择</p>
              <div className="flex flex-wrap gap-2">
                {filteredHeroes.map((h) => (
                  <button
                    key={h.ename}
                    type="button"
                    onClick={() => pickHero(h)}
                    className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition ${
                      heroId === h.ename
                        ? "border-[var(--gold)] bg-[rgba(212,175,106,0.15)] text-[var(--gold-bright)]"
                        : recentSet.has(h.ename) && !heroQuery.trim()
                          ? "border-[rgba(61,155,143,0.45)] text-[var(--text)]"
                          : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--gold)] hover:text-[var(--text)]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={h.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                    {h.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {result && (
        <section className="fade-in space-y-4">
          <div className="panel flex flex-wrap items-center gap-4 px-5 py-4">
            {result.hero.avatar && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.hero.avatar}
                alt={result.hero.name}
                className="h-14 w-14 rounded-xl object-cover ring-1 ring-[var(--line)]"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="text-xl text-[var(--gold-bright)]">{result.hero.name}</h2>
                {result.hero.title && (
                  <span className="text-sm text-[var(--muted)]">{result.hero.title}</span>
                )}
              </div>
              <p className="mt-1 text-sm text-[var(--muted)]">
                {result.zone.system} {result.zone.platform}
                {result.synDate ? ` · 数据日期 ${result.synDate}` : ""}
                {selectedHero || result.hero.ename ? ` · ID ${result.hero.ename}` : ""}
              </p>
            </div>
            <div className="grid w-full grid-cols-2 gap-4 text-sm sm:w-auto sm:flex sm:gap-6">
              <div className="min-w-0 sm:text-right">
                <div className="text-[var(--muted)]">本页最低</div>
                <div className="text-lg text-[var(--teal)]">{minRow?.rank ?? "—"}</div>
                <div className="truncate text-xs text-[var(--muted)] sm:max-w-[10rem]" title={minRow?.address}>
                  {minRow?.address || "—"}
                </div>
              </div>
              <div className="min-w-0 text-right">
                <div className="text-[var(--muted)]">本页最高</div>
                <div className="text-lg text-[var(--gold-bright)]">{maxRow?.rank ?? "—"}</div>
                <div className="truncate text-xs text-[var(--muted)] sm:max-w-[10rem]" title={maxRow?.address}>
                  {maxRow?.address || "—"}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex w-full gap-2 sm:w-auto">
              {LEVEL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setLevel(tab.key)}
                  className={`flex-1 rounded-full px-4 py-1.5 text-sm transition sm:flex-none ${
                    level === tab.key
                      ? "bg-[var(--gold)] text-[#1a1408]"
                      : "border border-[var(--line)] text-[var(--muted)] hover:text-[var(--text)]"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <input
              className="input sm:max-w-xs"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              placeholder="筛选地区，如：广东"
            />
          </div>

          <div className="panel overflow-hidden">
            <div className="space-y-3 p-3 sm:hidden">
              {rows.length === 0 ? (
                <div className="py-8 text-center text-[var(--muted)]">暂无数据</div>
              ) : (
                rows.map((row, i) => (
                  <div
                    key={`mobile-${row.adcode || row.address}-${row.rank}`}
                    className="rounded-2xl border border-[var(--line)] bg-black/15 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-[var(--muted)]">地区</div>
                        <div className="mt-1 break-words text-lg font-semibold text-[var(--text)]">
                          {row.address}
                        </div>
                      </div>
                      <span className="chip shrink-0">#{i + 1}</span>
                    </div>
                    <div className="mt-4 rounded-xl bg-black/20 p-3">
                      <div className="text-xs text-[var(--muted)]">战力门槛</div>
                      <div className="mt-1 text-xl font-semibold text-[var(--gold-bright)]">
                        {row.rank}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <table className="w-full text-left text-sm max-sm:hidden">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">地区</th>
                  <th className="px-4 py-3 font-medium">战力门槛</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-[var(--muted)]">
                      暂无数据
                    </td>
                  </tr>
                ) : (
                  rows.map((row, i) => (
                    <tr
                      key={`${row.adcode || row.address}-${row.rank}`}
                      className="border-b border-[var(--line)]/60 last:border-0"
                    >
                      <td className="px-4 py-2.5 text-[var(--muted)]">{i + 1}</td>
                      <td className="px-4 py-2.5">{row.address}</td>
                      <td className="px-4 py-2.5 font-medium text-[var(--gold-bright)]">
                        {row.rank}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
