"use client";

import Link from "next/link";
import { format } from "date-fns";

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
};

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
  if (!m.medal && !m.medalIcon && !mvpLabel && !m.evaluate) {
    return <span className="text-[var(--muted)]">—</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {m.medalIcon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={m.medalIcon}
          alt={m.medal || "奖牌"}
          title={m.medal || undefined}
          className="h-5 w-auto object-contain"
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
    <div>
      <div className="space-y-3 sm:hidden">
        {matches.map((m) => {
          const change = formatScoreChange(m);
          return (
            <div key={m.id} className="rounded-2xl border border-[var(--line)] bg-black/15 p-4">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/matches/${m.id}`}
                  className="flex min-w-0 items-center gap-2 hover:text-[var(--gold-bright)]"
                >
                  {m.heroIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.heroIcon}
                      alt=""
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <span className="break-words text-lg font-semibold text-[var(--gold-bright)]">
                    {m.heroName}
                  </span>
                </Link>
                <span className={m.result === "win" ? "chip chip-win" : "chip chip-lose"}>
                  {m.result === "win" ? "胜利" : "失败"}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">模式</div>
                  <div className="mt-1 break-words">{m.modeName || m.mode || "-"}</div>
                </div>
                <div className="rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">KDA</div>
                  <div className={`mt-1 ${kdaClass(m.kills, m.deaths) || ""}`}>
                    {m.kills != null ? `${m.kills}/${m.deaths}/${m.assists}` : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">评分</div>
                  <div className="mt-1 tabular-nums text-[var(--muted)]">
                    {m.score != null ? m.score : "—"}
                  </div>
                </div>
                <div className="rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">变动</div>
                  <div className="mt-1 tabular-nums">
                    {change ? (
                      <span className={change.className}>{change.text}</span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </div>
                </div>
                <div className="col-span-2 rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">荣誉</div>
                  <div className="mt-1">
                    <HonorBadges m={m} />
                  </div>
                </div>
                <div className="col-span-2 rounded-xl bg-black/20 p-3">
                  <div className="text-xs text-[var(--muted)]">时间</div>
                  <div className="mt-1 text-[var(--muted)]">
                    {format(new Date(m.playedAt), "MM-dd HH:mm")}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <table className="table max-sm:hidden">
        <thead>
          <tr>
            <th>结果</th>
            <th>英雄</th>
            <th>模式</th>
            <th>KDA</th>
            <th>评分</th>
            <th>变动</th>
            <th>荣誉</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => {
            const change = formatScoreChange(m);
            return (
            <tr key={m.id}>
              <td>
                <span className={m.result === "win" ? "chip chip-win" : "chip chip-lose"}>
                  {m.result === "win" ? "胜利" : "失败"}
                </span>
              </td>
              <td>
                <Link
                  href={`/matches/${m.id}`}
                  className="inline-flex min-w-0 items-center gap-2 hover:text-[var(--gold-bright)]"
                >
                  {m.heroIcon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.heroIcon}
                      alt=""
                      className="h-6 w-6 shrink-0 rounded-full object-cover"
                    />
                  ) : null}
                  <span className="max-w-24 truncate sm:max-w-none">{m.heroName}</span>
                </Link>
              </td>
              <td className="text-[var(--muted)]">{m.modeName || m.mode || "-"}</td>
              <td className={kdaClass(m.kills, m.deaths)}>
                {m.kills != null
                  ? `${m.kills}/${m.deaths}/${m.assists}`
                  : "—"}
              </td>
              <td className="tabular-nums text-[var(--muted)]">
                {m.score != null ? m.score : "—"}
              </td>
              <td className="tabular-nums">
                {change ? (
                  <span className={change.className}>{change.text}</span>
                ) : (
                  <span className="text-[var(--muted)]">—</span>
                )}
              </td>
              <td>
                <HonorBadges m={m} />
              </td>
              <td className="whitespace-nowrap text-[var(--muted)]">
                {format(new Date(m.playedAt), "MM-dd HH:mm")}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
