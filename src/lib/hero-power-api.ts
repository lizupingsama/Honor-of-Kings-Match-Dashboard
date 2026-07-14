/** ApiZero 王者全国英雄战力：https://v1.apizero.cn/api/wzry */

export type PowerZone = "aqq" | "awx" | "iqq" | "iwx";
export type PowerQueryType = "all" | "min" | "max";

export type HeroMeta = {
  name: string;
  title: string;
  ename: string;
  avatar: string;
};

export type RankItem = {
  address: string;
  level: "province" | "city" | "district" | string;
  adcode?: string;
  rank: number;
};

export type PowerQueryResult = {
  hero: HeroMeta;
  zone: { code: PowerZone; system: string; platform: string };
  type: string;
  typeCode: PowerQueryType;
  synDate: string;
  /** type=all 时为完整列表；min/max 时为空，用 extreme/similar */
  list: RankItem[];
  extreme?: {
    province?: RankItem;
    city?: RankItem;
    district?: RankItem;
  };
  similar?: {
    province: RankItem[];
    city: RankItem[];
    district: RankItem[];
  };
};

export class HeroPowerApiError extends Error {
  status: number;
  code: "invalid" | "not_found" | "rate_limit" | "config" | "upstream";
  constructor(message: string, code: HeroPowerApiError["code"], status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const ZONE_LABEL: Record<PowerZone, string> = {
  aqq: "安卓 QQ",
  awx: "安卓 微信",
  iqq: "iOS QQ",
  iwx: "iOS 微信",
};

export function getZoneLabel(zone: PowerZone) {
  return ZONE_LABEL[zone];
}

export function getHeroPowerApiBaseUrl() {
  return process.env.WZRY_POWER_API_BASE_URL || "https://v1.apizero.cn/api/wzry";
}

function asRankItem(row: Record<string, unknown>): RankItem | null {
  const address = String(row.address || "");
  const rank = Number(row.rank);
  if (!address || !Number.isFinite(rank)) return null;
  return {
    address,
    level: String(row.level || ""),
    adcode: row.adcode != null ? String(row.adcode) : undefined,
    rank,
  };
}

function asRankList(raw: unknown): RankItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => asRankItem(item as Record<string, unknown>))
    .filter((x): x is RankItem => Boolean(x));
}

async function request(params: Record<string, string>) {
  const url = new URL(getHeroPowerApiBaseUrl());
  for (const [k, v] of Object.entries(params)) {
    if (v) url.searchParams.set(k, v);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const apiKey = process.env.WZRY_API_KEY || process.env.WZRY_POWER_API_KEY;
  if (apiKey) {
    headers["X-Api-Key"] = apiKey;
    headers.Authorization = `Bearer ${apiKey}`;
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
  } catch {
    throw new HeroPowerApiError("战力接口请求失败，请稍后重试", "upstream");
  }

  if (res.status === 429) {
    throw new HeroPowerApiError("请求过于频繁，请稍后再试", "rate_limit", 429);
  }
  if (res.status === 401 || res.status === 403) {
    throw new HeroPowerApiError("API Key 无效或额度不足", "config", res.status);
  }

  const data = await res.json().catch(() => null);
  if (!data) throw new HeroPowerApiError("战力接口返回异常", "upstream");

  const code = Number(data.code ?? res.status);
  const msg = String(data.msg || data.message || "");

  // ApiZero 战力接口成功码为 0
  if (code !== 0) {
    if (code === 429 || msg.includes("频繁")) {
      throw new HeroPowerApiError(msg || "请求过于频繁", "rate_limit", 429);
    }
    if (code === 401 || code === 403 || msg.includes("权限") || msg.includes("额度")) {
      throw new HeroPowerApiError(msg || "API Key 无效或额度不足", "config", 403);
    }
    if (msg.includes("未找到") || msg.includes("不存在") || code === 404) {
      throw new HeroPowerApiError(msg || "未找到该英雄战力数据", "not_found", 404);
    }
    throw new HeroPowerApiError(msg || `接口错误 (${code})`, "upstream");
  }

  return data.data;
}

export async function fetchHeroList(): Promise<HeroMeta[]> {
  const data = await request({ action: "heroes" });
  const list = Array.isArray(data?.list)
    ? data.list
    : Array.isArray(data)
      ? data
      : [];

  return list
    .map((h: Record<string, unknown>) => ({
      name: String(h.name || h.cname || ""),
      title: String(h.title || ""),
      ename: String(h.ename || h.hero_id || ""),
      avatar: String(h.avatar || ""),
    }))
    .filter((h: HeroMeta) => Boolean(h.name && h.ename));
}

export async function queryHeroPower(opts: {
  hero?: string;
  heroId?: string;
  zone: PowerZone;
  type?: PowerQueryType;
}): Promise<PowerQueryResult> {
  const hero = opts.hero?.trim();
  const heroId = opts.heroId?.trim();
  if (!hero && !heroId) {
    throw new HeroPowerApiError("请指定英雄名称或 ID", "invalid", 400);
  }

  const zone = opts.zone;
  if (!["aqq", "awx", "iqq", "iwx"].includes(zone)) {
    throw new HeroPowerApiError("区服无效，请选择 aqq / awx / iqq / iwx", "invalid", 400);
  }

  const type: PowerQueryType = opts.type || "all";
  const params: Record<string, string> = {
    action: "query",
    zone,
    type,
  };
  if (heroId) params.hero_id = heroId;
  else if (hero) params.hero = hero;

  const data = await request(params);
  const heroInfo = (data?.hero || {}) as Record<string, unknown>;
  const zoneInfo = (data?.zone || {}) as Record<string, unknown>;
  const rankData = data?.rank_data;

  let list: RankItem[] = [];
  let extreme: PowerQueryResult["extreme"];
  let similar: PowerQueryResult["similar"];

  if (Array.isArray(rankData)) {
    list = asRankList(rankData);
  } else if (rankData && typeof rankData === "object") {
    const rd = rankData as Record<string, unknown>;
    if (Array.isArray(rd.list)) list = asRankList(rd.list);

    const ex = (rd.extreme || {}) as Record<string, unknown>;
    extreme = {
      province: ex.province ? asRankItem(ex.province as Record<string, unknown>) || undefined : undefined,
      city: ex.city ? asRankItem(ex.city as Record<string, unknown>) || undefined : undefined,
      district: ex.district
        ? asRankItem(ex.district as Record<string, unknown>) || undefined
        : undefined,
    };

    const sim = (rd.similar || {}) as Record<string, unknown>;
    similar = {
      province: asRankList(sim.province),
      city: asRankList(sim.city),
      district: asRankList(sim.district),
    };
  }

  return {
    hero: {
      name: String(heroInfo.name || hero || ""),
      title: String(heroInfo.title || ""),
      ename: String(heroInfo.ename || heroId || ""),
      avatar: String(heroInfo.avatar || ""),
    },
    zone: {
      code: String(zoneInfo.code || zone) as PowerZone,
      system: String(zoneInfo.system || ""),
      platform: String(zoneInfo.platform || ""),
    },
    type: String(data?.type || type),
    typeCode: (String(data?.type_code || type) as PowerQueryType) || type,
    synDate: String(data?.syn_date || ""),
    list,
    extreme,
    similar,
  };
}
