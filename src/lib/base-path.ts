/** 生产挂子路径时与 next.config basePath 对齐（构建时注入） */
export function withBasePath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
