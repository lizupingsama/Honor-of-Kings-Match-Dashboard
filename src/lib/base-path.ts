let clientBasePath = "";

/** 由 BasePathProvider 在渲染时注入（优先于 env / URL 推断） */
export function setClientBasePath(basePath: string) {
  clientBasePath = (basePath || "").replace(/\/$/, "");
  if (typeof window !== "undefined") {
    (window as unknown as { __WZRY_BASE_PATH__?: string }).__WZRY_BASE_PATH__ = clientBasePath;
  }
}

/**
 * 生产挂子路径时与 next.config basePath 对齐。
 * 优先级：Provider 注入 > 构建期 env > window.__WZRY_BASE_PATH__ > URL/_next 推断
 */
export function withBasePath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const base = resolveBasePath();
  return `${base}${p}`;
}

function resolveBasePath(): string {
  if (clientBasePath) return clientBasePath;

  if (typeof window !== "undefined") {
    const fromWindow = (window as unknown as { __WZRY_BASE_PATH__?: string }).__WZRY_BASE_PATH__;
    if (fromWindow) return fromWindow.replace(/\/$/, "");
  }

  const fromEnv = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  if (typeof window === "undefined") return "";

  const script = document.querySelector('script[src*="/_next/"]') as HTMLScriptElement | null;
  const src = script?.getAttribute("src") || script?.src || "";
  // 兼容绝对/相对脚本地址：/wzry/_next/... 或 https://host/wzry/_next/...
  const fromScript = src.match(/^(?:https?:\/\/[^/]+)?(\/[^?#]*?)\/_next\//);
  if (fromScript?.[1]) return fromScript[1].replace(/\/$/, "");

  // Next usePathname() 不含 basePath，而 location.pathname 含；两者相减可得 basePath
  // 这里仅用 location：若以 /wzry/ 开头则取该前缀（与当前部署一致）
  const pathname = window.location.pathname;
  if (pathname === "/wzry" || pathname.startsWith("/wzry/")) return "/wzry";

  return "";
}
