/**
 * 真实客户端 IP 提取与统计上报密钥。
 * 单独成文件（不引 prisma），供 proxy.ts 打包使用。
 */

/**
 * 从代理链提取真实客户端 IP。
 *
 * 线上链路：客户端 → 阿里云 ESA（X-Forwarded-For 首位为真实 IP）→ nginx（末尾追加回源节点 IP）→ 应用。
 * 2026-08 抓包实测应用收到的头形如 `X-Forwarded-For: 47.108.49.28, 118.31.144.31`，
 * 因此取倒数第二个；只有一跳（本地 dev / 直连 nginx）时取第一个。
 * 该规则对"客户端自带伪造 XFF 再经 ESA"也成立——ESA 会把真实 IP 追加在伪造值之后。
 */
export function extractClientIp(xff: string | null, realIp: string | null): string {
  if (xff) {
    const ips = xff
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (ips.length >= 2) return ips[ips.length - 2];
    if (ips.length === 1) return ips[0];
  }
  return realIp || "unknown";
}

/** proxy → /api/track 内部上报的共享密钥，防止外部直接伪造统计数据 */
export function getTrackSecret() {
  return (
    process.env.TRACK_SECRET ||
    process.env.ADMIN_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "dev-admin-secret"
  );
}
