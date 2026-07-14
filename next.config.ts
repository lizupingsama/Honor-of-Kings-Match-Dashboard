import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  // 生产挂在域名子路径时设置，例如 NEXT_BASE_PATH=/wzry
  ...(basePath ? { basePath } : {}),
  // 供客户端 fetch 拼接 /api 路径
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
};

export default nextConfig;
