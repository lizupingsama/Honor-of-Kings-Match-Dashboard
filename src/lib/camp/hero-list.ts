type HeroEntry = { ename: number; cname: string };

let cache: Map<string, string> | null = null;
let loading: Promise<Map<string, string>> | null = null;

async function loadHeroMap(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    const map = new Map<string, string>();
    try {
      const res = await fetch("https://pvp.qq.com/web201605/js/herolist.json", {
        cache: "force-cache",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const list = (await res.json()) as HeroEntry[];
      for (const h of list) {
        if (h?.ename != null && h?.cname) {
          map.set(String(h.ename), h.cname);
        }
      }
    } catch (err) {
      console.error("[camp] 加载英雄列表失败", err);
    }
    cache = map;
    loading = null;
    return map;
  })();

  return loading;
}

/** 按营地 heroId 解析中文名；失败时返回空串 */
export async function resolveHeroName(heroId: string | number | undefined | null) {
  if (heroId == null || heroId === "") return "";
  const map = await loadHeroMap();
  return map.get(String(heroId)) || "";
}

export function stripControlChars(text: string) {
  return text.replace(/[\u0000-\u001F\u007F]/g, "").trim();
}
