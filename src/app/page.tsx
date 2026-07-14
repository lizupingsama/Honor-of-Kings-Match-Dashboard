"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function HomePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) {
      setError("请输入王者名称");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: name }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "查询失败");
        return;
      }
      const resolved = json.data.player.gameNickname as string;
      router.push(`/p/${encodeURIComponent(resolved)}`);
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-12">
      <section className="fade-in relative overflow-hidden rounded-3xl border border-[var(--line)] px-6 py-14 sm:px-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(ellipse at 70% 30%, rgba(212,175,106,0.25), transparent 55%), radial-gradient(ellipse at 20% 80%, rgba(61,155,143,0.18), transparent 50%)",
          }}
        />
        <div className="relative mx-auto max-w-xl text-center">
          <p
            className="text-4xl font-normal tracking-wide text-[var(--gold-bright)] sm:text-5xl"
            style={{ fontFamily: "var(--font-title), serif" }}
          >
            王者战绩看板
          </p>
          <p className="mt-4 text-[var(--muted)]">输入玩家的王者名称，查看段位、英雄与近期对局</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-3 text-left">
            <label className="label">王者名称</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="例如：峡谷旅人"
                maxLength={32}
                autoFocus
              />
              <button className="btn btn-primary sm:min-w-28" disabled={loading}>
                {loading ? "查询中…" : "查询战绩"}
              </button>
            </div>
            {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
            <p className="text-xs text-[var(--muted)]">
              已对接 ApiZero 战绩接口：输入王者名称即可查询。
              请在 <code className="text-[var(--gold)]">.env</code> 填写{" "}
              <code className="text-[var(--gold)]">WZRY_API_KEY</code>
              （到 apizero.cn/account/keys 复制）。若上游提示登录态失效，稍后再试。
            </p>
          </form>
        </div>
      </section>

      <section className="fade-in flex flex-wrap items-center justify-center gap-6 text-center">
        <Link href="/hero-power" className="btn btn-primary text-sm">
          英雄战力查询
        </Link>
        <Link href="/leaderboard" className="text-sm text-[var(--gold)] hover:underline">
          查看站内排行榜 →
        </Link>
      </section>
    </div>
  );
}
