"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { withBasePath } from "@/lib/base-path";

/**
 * 浏览器端访问上报：真实用户的浏览器会执行 JS 发出该请求，
 * 扫描器 / 爬虫基本不会，因此 source=beacon 的记录可视为"真实访客"。
 * IP 由服务端从请求头还原，客户端只上报路径。
 */
export function TrackBeacon() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || last.current === pathname) return;
    last.current = pathname;
    const url = withBasePath("/api/track");
    const body = JSON.stringify({ path: pathname });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([body], { type: "application/json" }));
      } else {
        fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      // 上报失败无影响
    }
  }, [pathname]);

  return null;
}
