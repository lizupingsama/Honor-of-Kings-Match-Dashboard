"use client";

import Link from "next/link";
import { format } from "date-fns";

export type MatchEquipRow = {
  equipId: number;
  equipIcon: string;
  equipName: string;
};

export type MatchRow = {
  id: string;
  playedAt: string | Date;
  modeName?: string | null;
  mode?: string;
  heroName: string;
  heroIcon?: string | null;
  result: string;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  score?: number | null;
  evaluate?: string | null;
  medal?: string | null;
  medalIcon?: string | null;
  mvp?: boolean;
  mvpType?: string | null;
  gold?: boolean;
  rankName?: string | null;
  stars?: number | null;
  peakScore?: number | null;
  peakDelta?: number | null;
  rankDelta?: number | null;
  economy?: number | null;
  economyPct?: number | null;
  damage?: number | null;
  damagePct?: number | null;
  takenDamage?: number | null;
  takenDamagePct?: number | null;
  joinPct?: number | null;
  equips?: MatchEquipRow[] | null;
};

function formatStatWithPct(value?: number | null, pct?: number | null) {
  if (value == null) return null;
  const base = value.toLocaleString("zh-CN");
  if (pct == null) return base;
  return `${base} (${pct}%)`;
}

function EquipIcons({ equips }: { equips?: MatchEquipRow[] | null }) {
  if (!equips?.length) return null;
  return (
    <div className="flex items-center gap-1">
      {equips.map((eq) =>
        eq.equipIcon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${eq.equipId}-${eq.equipName}`}
            src={eq.equipIcon}
            alt={eq.equipName}
            title={eq.equipName}
            className="h-6 w-6 rounded-full border border-white/10 bg-black/40 object-cover sm:h-7 sm:w-7"
          />
        ) : (
          <span
            key={`${eq.equipId}-${eq.equipName}`}
            title={eq.equipName}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-black/40 text-[8px] text-[var(--muted)] sm:h-7 sm:w-7"
          >
            ·
          </span>
        ),
      )}
    </div>
  );
}

function kdaClass(kills?: number | null, deaths?: number | null) {
  if (kills == null || deaths == null) return undefined;
  if (kills < deaths) return "text-[var(--crimson)]";
  if (kills > deaths) return "text-[var(--teal)]";
  return "text-white";
}

function formatScoreChange(m: MatchRow): { text: string; className: string } | null {
  if (m.mode === "peak" && m.peakDelta != null) {
    const n = m.peakDelta;
    if (n === 0) return { text: "0", className: "text-[var(--muted)]" };
    return {
      text: n > 0 ? `+${n}` : String(n),
      className: n > 0 ? "text-[var(--teal)]" : "text-[var(--crimson)]",
    };
  }
  if (m.mode === "ranked" && m.rankDelta != null) {
    const n = m.rankDelta;
    if (n === 0) return { text: "0星", className: "text-[var(--muted)]" };
    return {
      text: n > 0 ? `+${n}星` : `${n}星`,
      className: n > 0 ? "text-[var(--teal)]" : "text-[var(--crimson)]",
    };
  }
  return null;
}

function medalChipClass(medal: string) {
  if (medal.startsWith("金牌")) return "chip-medal-gold";
  if (medal.startsWith("铜牌")) return "chip-medal-bronze";
  return "chip-medal-silver";
}

function HonorBadges({ m }: { m: MatchRow }) {
  const mvpLabel =
    m.mvpType === "svp" ? "SVP" : m.mvpType === "mvp" || m.mvp ? "MVP" : null;
  if (!m.medal && !m.medalIcon && !mvpLabel && !m.evaluate) return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {m.medalIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.medalIcon}
          alt={m.medal || "奖牌"}
          title={m.medal || undefined}
          className="h-4 w-auto object-contain"
        />
      ) : m.medal ? (
        <span className={`chip ${medalChipClass(m.medal)}`}>{m.medal}</span>
      ) : null}
      {mvpLabel ? <span className="chip chip-mvp">{mvpLabel}</span> : null}
      {m.evaluate ? (
        <span className="text-xs text-[var(--muted)]">{m.evaluate}</span>
      ) : null}
    </div>
  );
}

export function MatchTable({ matches }: { matches: MatchRow[] }) {
  if (!matches.length) {
    return (
      <div className="py-8 text-center text-sm text-[var(--muted)]">暂无对局记录</div>
    );
  }

  return (
    <div className="space-y-2">
      {matches.map((m) => {
        const change = formatScoreChange(m);
        const honors = <HonorBadges m={m} />;
        return (
          <Link
            key={m.id}
            href={`/matches/${m.id}`}
            className="block rounded-xl border border-[var(--line)] bg-black/15 px-3 py-2.5 transition hover:border-[var(--gold)]/40 hover:bg-black/25 sm:px-4"
          >
            <div className="flex items-start gap-3">
              {m.heroIcon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={m.heroIcon}
                  alt=""
                  className="mt-0.5 h-11 w-11 shrink-0 rounded-lg object-cover sm:h-12 sm:w-12"
                />
              ) : (
                <div className="mt-0.5 h-11 w-11 shrink-0 rounded-lg bg-black/30 sm:h-12 sm:w-12" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate font-semibold text-[var(--gold-bright)]">
                        {m.heroName}
                      </span>
                      {honors}
                    </div>
                    {m.equips?.length ? (
                      <div className="mt-1.5">
                        <EquipIcons equips={m.equips} />
                      </div>
                    ) : null}
                    {(m.economy != null ||
                      m.damage != null ||
                      m.takenDamage != null ||
                      m.joinPct != null) && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-[var(--muted)]">
                        {m.economy != null ? (
                          <span>经济 {formatStatWithPct(m.economy, m.economyPct)}</span>
                        ) : null}
                        {m.damage != null ? (
                          <span>输出 {formatStatWithPct(m.damage, m.damagePct)}</span>
                        ) : null}
                        {m.takenDamage != null ? (
                          <span>
                            承伤 {formatStatWithPct(m.takenDamage, m.takenDamagePct)}
                          </span>
                        ) : null}
                        {m.joinPct != null ? <span>参团 {m.joinPct}%</span> : null}
                      </div>
                    )}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
                      <span>{m.modeName || m.mode || "-"}</span>
                      {change ? (
                        <span className={`tabular-nums ${change.className}`}>{change.text}</span>
                      ) : null}
                      <span>{format(new Date(m.playedAt), "MM-dd HH:mm")}</span>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={
                        m.result === "win" ? "chip chip-win" : "chip chip-lose"
                      }
                    >
                      {m.result === "win" ? "胜利" : "失败"}
                    </span>
                    <div
                      className={`mt-1.5 text-sm tabular-nums ${kdaClass(m.kills, m.deaths) || "text-[var(--muted)]"}`}
                    >
                      {m.kills != null ? `${m.kills}/${m.deaths}/${m.assists}` : "—"}
                    </div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums text-white sm:text-lg">
                      {m.score != null ? `${m.score}分` : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
