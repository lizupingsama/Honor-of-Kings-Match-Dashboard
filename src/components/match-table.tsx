"use client";

import Link from "next/link";
import { format } from "date-fns";

export type MatchRow = {
  id: string;
  playedAt: string | Date;
  modeName?: string | null;
  mode?: string;
  heroName: string;
  result: string;
  kills?: number | null;
  deaths?: number | null;
  assists?: number | null;
  score?: number | null;
  evaluate?: string | null;
  rankName?: string | null;
  stars?: number | null;
};

export function MatchTable({ matches }: { matches: MatchRow[] }) {
  if (!matches.length) {
    return (
      <div className="py-8 text-center text-sm text-[var(--muted)]">暂无对局记录</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>结果</th>
            <th>英雄</th>
            <th>模式</th>
            <th>KDA</th>
            <th>评价</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id}>
              <td>
                <span className={m.result === "win" ? "chip chip-win" : "chip chip-lose"}>
                  {m.result === "win" ? "胜利" : "失败"}
                </span>
              </td>
              <td>
                <Link href={`/matches/${m.id}`} className="hover:text-[var(--gold-bright)]">
                  {m.heroName}
                </Link>
              </td>
              <td className="text-[var(--muted)]">{m.modeName || m.mode || "-"}</td>
              <td>
                {m.kills != null
                  ? `${m.kills}/${m.deaths}/${m.assists}`
                  : "—"}
              </td>
              <td className="text-[var(--muted)]">
                {m.evaluate || (m.score != null ? m.score : "—")}
              </td>
              <td className="whitespace-nowrap text-[var(--muted)]">
                {format(new Date(m.playedAt), "MM-dd HH:mm")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
