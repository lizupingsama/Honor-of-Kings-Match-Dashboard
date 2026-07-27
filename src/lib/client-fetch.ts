import { withBasePath } from "./base-path";

/**
 * 客户端 API 请求统一入口。
 * 线上 CDN（阿里云 ESA）默认边缘缓存会无视源站 no-store，把 GET 接口响应缓存数十天，
 * 造成登录态校验、玩家数据、排行榜互相不同步。这里给每个请求附加时间戳参数，
 * 保证 URL 唯一、边缘缓存必然 MISS。
 */
export function apiFetch(path: string, init?: RequestInit) {
  const sep = path.includes("?") ? "&" : "?";
  const { headers, ...rest } = init || {};
  return fetch(withBasePath(`${path}${sep}_ts=${Date.now()}`), {
    cache: "no-store",
    ...rest,
    headers: { "Cache-Control": "no-cache", ...(headers as Record<string, string> | undefined) },
  });
}
