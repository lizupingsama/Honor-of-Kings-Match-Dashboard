import {
  defaultDbFile,
  isValidIp,
  loadContentFromFile,
  newWithBuffer,
} from "ip2region-ts";

let searcher: ReturnType<typeof newWithBuffer> | null = null;

function getSearcher() {
  if (!searcher) {
    searcher = newWithBuffer(loadContentFromFile(defaultDbFile));
  }
  return searcher;
}

/** 将 `国家|区|省|市|运营商` 格式化为可读归属地 */
export function formatIpRegion(region: string | null | undefined): string | null {
  if (!region) return null;
  const [country = "", , province = "", city = "", isp = ""] = region
    .split("|")
    .map((p) => (p === "0" || !p ? "" : p));
  const place = [province, city].filter(Boolean).join(" ") || country;
  if (place && isp && isp !== place) return `${place} · ${isp}`;
  return place || isp || null;
}

export async function lookupIpGeo(ip: string): Promise<string | null> {
  if (!ip || !isValidIp(ip)) return null;
  try {
    const { region } = await getSearcher().search(ip);
    return formatIpRegion(region);
  } catch {
    return null;
  }
}

/** 批量查询；同页重复 IP 只查一次 */
export async function lookupIpGeos(ips: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ips.filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (ip) => [ip, await lookupIpGeo(ip)] as const),
  );
  return new Map(entries);
}
