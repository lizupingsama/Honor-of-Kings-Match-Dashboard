"use client";

import { FormEvent, useState } from "react";
import { withBasePath } from "@/lib/base-path";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(withBasePath(`/api/admin/auth?t=${Date.now()}`), {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "登录失败");
        return;
      }
      // 软跳转偶发读不到刚写入的 Cookie，整页进入后台更稳
      window.location.assign(withBasePath("/admin"));
      return;
    } catch {
      setError("网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md fade-in">
      <div className="panel p-6 sm:p-8">
        <h1 className="text-xl font-semibold text-[var(--gold-bright)]">管理后台登录</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          用于手动增删改玩家评分、巅峰分与英雄战力。
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="password">
              管理员密码
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
              required
            />
          </div>
          {error && <p className="text-sm text-[var(--crimson)]">{error}</p>}
          <button type="submit" className="btn btn-primary w-full" disabled={loading}>
            {loading ? "登录中…" : "进入后台"}
          </button>
        </form>
      </div>
    </div>
  );
}
