"use client";

import { useCallback, useEffect, useState } from "react";
import { withBasePath } from "@/lib/base-path";

const CLIENT_KEY_STORAGE = "wzry_like_client_key";

function getOrCreateClientKey(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY_STORAGE);
    if (existing && /^[a-zA-Z0-9_-]{8,64}$/.test(existing)) return existing;
    const key =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID().replace(/-/g, "")
        : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(CLIENT_KEY_STORAGE, key);
    return key;
  } catch {
    return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function PlayerLikeButton({
  nickname,
  initialCount = 0,
}: {
  nickname: string;
  initialCount?: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [likedToday, setLikedToday] = useState(false);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  useEffect(() => {
    let cancelled = false;
    const clientKey = getOrCreateClientKey();
    fetch(
      withBasePath(
        `/api/players/${encodeURIComponent(nickname)}/like?clientKey=${encodeURIComponent(clientKey)}`,
      ),
      { cache: "no-store" },
    )
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json.ok) return;
        setCount(json.data.likeCount ?? 0);
        setLikedToday(Boolean(json.data.likedToday));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nickname]);

  const onLike = useCallback(async () => {
    if (likedToday || pending) return;
    setPending(true);
    try {
      const clientKey = getOrCreateClientKey();
      const res = await fetch(
        withBasePath(`/api/players/${encodeURIComponent(nickname)}/like`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ clientKey }),
        },
      );
      const json = await res.json();
      if (json.ok) {
        setCount(json.data.likeCount ?? count + 1);
        setLikedToday(true);
      } else if (res.status === 409) {
        setLikedToday(true);
        if (typeof json.likeCount === "number") setCount(json.likeCount);
      }
    } catch {
      // ignore
    } finally {
      setPending(false);
    }
  }, [count, likedToday, nickname, pending]);

  return (
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] bg-black/25 px-2.5 py-1 text-sm transition hover:border-[rgba(212,175,106,0.45)] disabled:cursor-default disabled:opacity-80"
      onClick={onLike}
      disabled={!ready || likedToday || pending}
      title={likedToday ? "今天已点过赞" : "点赞（每个浏览器每天一次）"}
      aria-label={likedToday ? "今天已点赞" : "点赞"}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill={likedToday ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={likedToday ? "text-[var(--gold-bright)]" : "text-[var(--muted)]"}
        aria-hidden
      >
        <path d="M7 11v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1h3zm0 0V8a4 4 0 0 1 4-4h1.5A1.5 1.5 0 0 1 14 5.5V11h5.2a2 2 0 0 1 1.98 2.28l-1.1 7A2 2 0 0 1 18.1 22H9a2 2 0 0 1-2-2" />
      </svg>
      <span
        className={`tabular-nums ${likedToday ? "text-[var(--gold-bright)]" : "text-[var(--muted)]"}`}
      >
        {count}
      </span>
    </button>
  );
}
