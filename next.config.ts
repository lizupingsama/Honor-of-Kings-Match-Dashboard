import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  // 生产挂在域名子路径时设置，例如 NEXT_BASE_PATH=/wzry
  ...(basePath ? { basePath } : {}),
  // 供客户端 fetch 拼接 /api 路径
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async headers() {
    const noStore = [
      {
        key: "Cache-Control",
        value: "no-store, no-cache, must-revalidate, proxy-revalidate",
      },
    ];

    return [
      { source: "/", headers: noStore },
      { source: "/hero-power", headers: noStore },
      { source: "/leaderboard", headers: noStore },
      { source: "/admin/:path*", headers: noStore },
      { source: "/p/:path*", headers: noStore },
      { source: "/matches/:path*", headers: noStore },
      { source: "/api/:path*", headers: noStore },
    ];
  },
};

export default nextConfig;
