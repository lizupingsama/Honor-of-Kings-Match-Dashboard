import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { extractClientIp, getTrackSecret } from "@/lib/client-ip";

/**
 * 访客 IP 统计：拦截页面请求，异步上报到内部 /api/track 落库。
 * 走内部 HTTP 而非直接引 prisma，避免 proxy 独立打包携带第二个
 * SQLite 连接（与主应用争锁）。上报不阻塞响应、失败静默。
 */

/** 兜底排除带静态扩展名的路径（matcher 已排除 _next 等目录） */
const STATIC_EXT =
  /\.(?:png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|map|json|xml|txt|woff2?|ttf|otf|mp4|webm)$/i;

export function proxy(req: NextRequest, event: NextFetchEvent) {
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      const { pathname, basePath } = req.nextUrl;
      if (!pathname.startsWith("/api") && !STATIC_EXT.test(pathname)) {
        const headers = req.headers;
        const payload = {
          ip: extractClientIp(headers.get("x-forwarded-for"), headers.get("x-real-ip")),
          path: pathname,
          userAgent: headers.get("user-agent") ?? undefined,
          referer: headers.get("referer") ?? undefined,
          xff: headers.get("x-forwarded-for") ?? undefined,
        };
        const port = process.env.PORT || "3000";
        event.waitUntil(
          fetch(`http://127.0.0.1:${port}${basePath}/api/track`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-track-secret": getTrackSecret(),
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {}),
        );
      }
    }
  } catch {
    // 统计绝不影响正常请求
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    {
      // 排除 API、构建产物与元数据文件；预取请求不计入
      source: "/((?!api|_next|favicon|robots\\.txt|sitemap\\.xml|\\.well-known).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
