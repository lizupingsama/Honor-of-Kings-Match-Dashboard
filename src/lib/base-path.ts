/**
 * 生产挂子路径时与 next.config basePath 对齐。
 * 优先用构建期注入；客户端再从 URL/_next 脚本路径兜底，避免漏配 env 导致请求打到站根。
 */
export function withBasePath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = resolveBasePath();
  return `${base}${p}`;
}

function resolveBasePath(): string {
  const fromEnv = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return "";

  const script = document.querySelector('script[src*="/_next/"]') as HTMLScriptElement | null;
  const src = script?.src || "";
  const fromScript = src.match(/^(https?:\/\/[^/]+)(\/[^?#]*?)\/_next\//);
  if (fromScript?.[2]) return fromScript[2].replace(/\/$/, "");

  // 当前页在 /wzry/... 时，回退取第一段路径
  const segs = window.location.pathname.split("/").filter(Boolean);
  if (segs.length >= 1 && segs[0] === "wzry") return "/wzry";

  return "";
}
