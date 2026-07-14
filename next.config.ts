import type { NextConfig } from "next";

const basePath = process.env.NEXT_BASE_PATH?.replace(/\/$/, "") || "";

const nextConfig: NextConfig = {
  // 生产挂在域名子路径时设置，例如 NEXT_BASE_PATH=/wzry
  ...(basePath ? { basePath } : {}),
};

export default nextConfig;
