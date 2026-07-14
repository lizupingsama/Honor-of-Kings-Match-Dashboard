"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const [match, setMatch] = useState<{
    heroName: string;
    result: string;
    modeName?: string | null;
    playedAt: string;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    score: number | null;
    evaluate?: string | null;
    durationSec?: number | null;
    rankName?: string | null;
    stars?: number | null;
    mvp: boolean;
    gold: boolean;
    economy: number | null;
    damage: number | null;
    player: { gameNickname: string };
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/matches/${params.id}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) setError(json.error || "加载失败");
        else setMatch(json.data.match);
      })
      .catch(() => setError("加载失败"));
  }, [params.id]);

  if (error) return <div className="text-[var(--crimson)]">{error}</div>;
  if (!match) return <div className="text-[var(--muted)]">加载中…</div>;

  const rows = [
    ["英雄", match.heroName],
    ["结果", match.result === "win" ? "胜利" : "失败"],
    ["模式", match.modeName || "-"],
    [
      "KDA",
      match.kills != null ? `${match.kills}/${match.deaths}/${match.assists}` : "—",
    ],
    ["评分", match.score != null ? String(match.score) : "—"],
    ["评价", match.evaluate || "-"],
    [
      "时长",
      match.durationSec
        ? `${Math.floor(match.durationSec / 60)}分${match.durationSec % 60}秒`
        : "-",
    ],
    ["段位", match.rankName ? `${match.rankName} ${match.stars ?? 0}星` : "-"],
    ["经济", match.economy != null ? String(match.economy) : "—"],
    ["伤害", match.damage != null ? String(match.damage) : "—"],
    ["时间", format(new Date(match.playedAt), "yyyy-MM-dd HH:mm")],
  ];

  return (
    <div className="mx-auto max-w-lg space-y-4 fade-in">
      <Link
        href={`/p/${encodeURIComponent(match.player.gameNickname)}`}
        className="text-sm text-[var(--gold)]"
      >
        ← 返回 {match.player.gameNickname}
      </Link>
      <div className="panel p-6">
        <h1 className="text-xl text-[var(--gold-bright)]">对局详情</h1>
        <div className="mt-2 flex gap-2">
          {match.mvp && <span className="chip chip-win">MVP</span>}
          {match.gold && <span className="chip">金牌</span>}
        </div>
        <dl className="mt-6 space-y-3">
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex justify-between gap-4 border-b border-white/5 pb-2 text-sm"
            >
              <dt className="text-[var(--muted)]">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
