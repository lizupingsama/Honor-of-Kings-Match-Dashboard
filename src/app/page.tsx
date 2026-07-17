"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { withBasePath } from "@/lib/base-path";

export default function HomePage() {
  const router = useRouter();
  const [campId, setCampId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = campId.trim();
    if (!id) {
      setError("请输入营地 ID");
      return;
    }
    if (!/^\d{5,15}$/.test(id)) {
      setError("营地 ID 应为 5–15 位数字");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(withBasePath("/api/lookup"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campId: id }),
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
          <p className="mt-4 text-[var(--muted)]">
            输入王者营地 ID，查看段位、英雄与近期对局
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-3 text-left">
            <label className="label">营地 ID</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                className="input flex-1"
                value={campId}
                onChange={(e) => setCampId(e.target.value.replace(/\D/g, "").slice(0, 15))}
                placeholder="例如：123456789"
                inputMode="numeric"
                maxLength={15}
                autoFocus
              />
              <button className="btn btn-primary sm:min-w-28" disabled={loading}>
                {loading ? "跳转中…" : "查询战绩"}
              </button>
            </div>
            {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
            <p className="text-xs text-[var(--muted)]">
              打开王者营地 App → 个人主页，即可查看营地 ID（纯数字）。
              若提示登录态失效，请管理员到{" "}
              <Link href="/admin" className="text-[var(--gold)] hover:underline">
                管理后台
              </Link>{" "}
              微信扫码重新登录营地。已入库玩家也可从排行榜按昵称进入。
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
