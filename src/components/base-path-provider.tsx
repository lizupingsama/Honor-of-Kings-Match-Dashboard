"use client";

import { useLayoutEffect } from "react";
import { setClientBasePath } from "@/lib/base-path";

/** 把服务端读到的 NEXT_BASE_PATH 注入客户端，避免构建期漏配导致 /api 打到站根 */
export function BasePathProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: React.ReactNode;
}) {
  const normalized = (basePath || "").replace(/\/$/, "");
  // 同步写入，保证子组件首次 useEffect 里的 fetch 已能读到
  setClientBasePath(normalized);
  useLayoutEffect(() => {
    setClientBasePath(normalized);
  }, [normalized]);
  return children;
}
