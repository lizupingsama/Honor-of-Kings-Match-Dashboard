export type MatchEquip = {
  equipId: number;
  equipIcon: string;
  equipName: string;
};

export type NormalizedMatch = {
  externalId: string;
  playedAt: Date;
  mode: "ranked" | "peak" | "fun" | "other";
  modeName: string;
  heroId?: string;
  heroName: string;
  heroIcon?: string;
  result: "win" | "lose";
  kills: number;
  deaths: number;
  assists: number;
  score?: number;
  evaluate?: string;
  durationSec?: number;
  rankName?: string;
  stars?: number;
  /** 巅峰赛积分（对局结束后） */
  peakScore?: number;
  /** 本场巅峰分变化（new - old） */
  peakDelta?: number;
  mvp?: boolean;
  gold?: boolean;
  /** 奖牌文案，如 银牌打野 */
  medal?: string;
  /** 官方奖牌图 URL（evaluateUrlV3） */
  medalIcon?: string;
  /** mvp | svp */
  mvpType?: "mvp" | "svp";
  /** 官方 MVP/SVP 图标 URL（mvpUrlV3 / mvpUrlV2） */
  mvpIcon?: string;
  /** 阵营：blue | red */
  side?: "blue" | "red";
  economy?: number;
  /** 经济占本队比例（0–100） */
  economyPct?: number;
  /** 对英雄输出（营地 totalHeroHurtCnt） */
  damage?: number;
  /** 输出占本队比例（0–100） */
  damagePct?: number;
  /** 承伤英雄伤害（营地 totalBeheroHurtCnt） */
  takenDamage?: number;
  /** 承伤占本队比例（0–100） */
  takenDamagePct?: number;
  /** 参团率（0–100） */
  joinPct?: number;
  /** 对局时英雄战力（营地 fightPower） */
  combatPower?: number;
  /** 本场出装（来自对局详情） */
  equips?: MatchEquip[];
  rawJson?: string;
};

export type NormalizedProfile = {
  campId: string;
  gameNickname: string;
  gameAvatarUrl?: string;
  currentRank: string;
  currentStars: number;
  seasonWins?: number;
  seasonGames?: number;
  /** 本赛季排位平均评分（营地 averageScore，约 0–110） */
  rankScore?: number;
  /** 本赛季巅峰平均评分（营地 masterInfo.averageScore） */
  peakRating?: number;
  /** 当前巅峰分（营地 masterScore） */
  peakScore?: number;
  mvpCount?: number;
  goldCount?: number;
  area?: "wechat" | "qq";
};

export type FetchResult = {
  profile: NormalizedProfile;
  matches: NormalizedMatch[];
  /** 营地 roleId，用于补全对局详情 */
  roleId?: string;
};

export type PlayerSearchHit = {
  gameNickname: string;
  campId: string;
  area: "wechat" | "qq";
  currentRank?: string;
  currentStars?: number;
  /** 营地昵称（搜索匹配用，可能与游戏角色名不同） */
  campNickname?: string;
};

export class WzryApiError extends Error {
  code: "hidden" | "invalid_id" | "not_found" | "rate_limit" | "upstream" | "config";
  constructor(message: string, code: WzryApiError["code"]) {
    super(message);
    this.code = code;
  }
}

export interface WzryApiClient {
  /** 按王者名称查询（可返回多名同名提示，mock 精确命中一人） */
  searchByNickname(nickname: string): Promise<PlayerSearchHit[]>;
  fetchBattles(
    campId: string,
    options?: {
      num?: number;
      nickname?: string;
      /** 已入库对局 externalId；传入则增量拉取（撞到已知对局即停） */
      knownExternalIds?: string[];
      /** 是否拉取对局详情（出装/经济/伤害）；默认 true */
      enrichDetails?: boolean;
    },
  ): Promise<FetchResult>;
  /**
   * 检查目标玩家是否开放战绩查询。
   * 未开放时应抛出 code=hidden；未实现则跳过预检。
   */
  assertBattleQueryAllowed?(campId: string): Promise<void>;
}

function detectMode(mapName: string): NormalizedMatch["mode"] {
  if (!mapName) return "other";
  if (mapName.includes("排位") || mapName.includes("排位赛")) return "ranked";
  if (mapName.includes("巅峰")) return "peak";
  if (mapName.includes("匹配") || mapName.includes("娱乐") || mapName.includes("5v5")) return "fun";
  return "other";
}

function parseResult(r: string): "win" | "lose" {
  return r?.includes("胜") || r?.toLowerCase() === "win" ? "win" : "lose";
}

/** 由昵称生成稳定的伪营地 ID（仅 mock / 本地缓存用） */
export function nicknameToCampId(nickname: string): string {
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = (hash * 31 + nickname.charCodeAt(i)) >>> 0;
  }
  const n = (hash % 9000000000) + 1000000000;
  return String(n);
}

function buildMockMatches(seedKey: string, nickname: string, num: number): FetchResult {
  const heroes = [
    { id: "167", name: "孙悟空" },
    { id: "141", name: "貂蝉" },
    { id: "131", name: "李白" },
    { id: "150", name: "韩信" },
    { id: "107", name: "赵云" },
    { id: "157", name: "不知火舞" },
    { id: "106", name: "小乔" },
    { id: "190", name: "诸葛亮" },
    { id: "175", name: "钟馗" },
    { id: "116", name: "阿轲" },
    { id: "142", name: "安琪拉" },
    { id: "123", name: "吕布" },
  ];

  const ranks = [
    { name: "星耀I", stars: 3 },
    { name: "星耀I", stars: 4 },
    { name: "王者", stars: 1 },
    { name: "王者", stars: 2 },
    { name: "王者", stars: 3 },
    { name: "王者", stars: 5 },
    { name: "王者", stars: 6 },
    { name: "王者", stars: 8 },
    { name: "王者", stars: 10 },
    { name: "王者", stars: 12 },
  ];

  const modes = [
    { mode: "ranked" as const, name: "排位赛" },
    { mode: "ranked" as const, name: "排位赛" },
    { mode: "ranked" as const, name: "排位赛" },
    { mode: "peak" as const, name: "巅峰赛" },
    { mode: "fun" as const, name: "匹配赛" },
  ];

  const seed = [...seedKey].reduce((a, c) => a + c.charCodeAt(0), 0);
  const campId = /^\d+$/.test(seedKey) ? seedKey : nicknameToCampId(nickname);
  const matches: NormalizedMatch[] = [];
  const now = Date.now();

  for (let i = 0; i < num; i++) {
    const rng = (seed * (i + 7) * 9301 + 49297) % 233280;
    const hero = heroes[(seed + i * 3) % heroes.length];
    const mode = modes[(seed + i) % modes.length];
    const rank = ranks[Math.min(i, ranks.length - 1)];
    const win = (rng + i) % 10 < 6;
    const kills = 2 + ((rng >> 2) % 12);
    const deaths = 1 + ((rng >> 4) % 8);
    const assists = 2 + ((rng >> 6) % 14);
    const score = 6 + (rng % 50) / 10;
    const playedAt = new Date(now - i * 3.5 * 3600 * 1000 - (rng % 3600) * 1000);
    const day = playedAt.toISOString().slice(0, 13);

    matches.push({
      externalId: `mock-${campId}-${hero.name}-${day}-${kills}${deaths}`,
      playedAt,
      mode: mode.mode,
      modeName: mode.name,
      heroId: hero.id,
      heroName: hero.name,
      result: win ? "win" : "lose",
      kills,
      deaths,
      assists,
      score: Math.round(score * 10) / 10,
      evaluate: score >= 10 ? "MVP" : score >= 9 ? "金牌" : score >= 8 ? "银牌" : "普通",
      durationSec: 600 + (rng % 600),
      rankName: mode.mode === "ranked" ? rank.name : undefined,
      stars: mode.mode === "ranked" ? rank.stars : undefined,
      mvp: score >= 10,
      gold: score >= 9 && score < 10,
      economy: 8000 + (rng % 6000),
      damage: 40000 + (rng % 80000),
    });
  }

  const latestRank = ranks[Math.min(num - 1, ranks.length - 1)];
  const wins = matches.filter((m) => m.result === "win").length;
  const area: "wechat" | "qq" = seed % 2 === 0 ? "wechat" : "qq";

  return {
    profile: {
      campId,
      gameNickname: nickname,
      currentRank: latestRank.name,
      currentStars: latestRank.stars,
      seasonWins: wins,
      seasonGames: matches.length,
      mvpCount: matches.filter((m) => m.mvp).length,
      goldCount: matches.filter((m) => m.gold).length,
      area,
    },
    matches,
  };
}

export class MockWzryApiClient implements WzryApiClient {
  async searchByNickname(nickname: string): Promise<PlayerSearchHit[]> {
    const name = nickname.trim();
    if (!name || name.length < 1) {
      throw new WzryApiError("请输入王者名称", "invalid_id");
    }
    if (name === "隐藏玩家") {
      throw new WzryApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
    }

    const campId = nicknameToCampId(name);
    const seed = [...campId].reduce((a, c) => a + c.charCodeAt(0), 0);
    return [
      {
        gameNickname: name,
        campId,
        area: seed % 2 === 0 ? "wechat" : "qq",
        currentRank: seed % 3 === 0 ? "星耀I" : "王者",
        currentStars: (seed % 20) + 1,
      },
    ];
  }

  async assertBattleQueryAllowed(campId: string): Promise<void> {
    if (campId === "0000000000") {
      throw new WzryApiError(
        "召唤师隐藏了个人战绩，请在王者营地开放战绩后重试",
        "hidden",
      );
    }
  }

  async fetchBattles(
    campId: string,
    options?: { num?: number; nickname?: string },
  ): Promise<FetchResult> {
    if (options?.nickname === "隐藏玩家" || campId === "0000000000") {
      throw new WzryApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
    }
    const nickname = options?.nickname || `召唤师${campId.slice(-4)}`;
    return buildMockMatches(campId, nickname, options?.num ?? 60);
  }
}

export class YujnWzryApiClient implements WzryApiClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  async searchByNickname(nickname: string): Promise<PlayerSearchHit[]> {
    const name = nickname.trim();
    // 遇见接口以营地 ID 为主：若输入纯数字则当作营地 ID
    if (/^\d{5,15}$/.test(name)) {
      const result = await this.fetchBattles(name, { num: 3 });
      return [
        {
          gameNickname: result.profile.gameNickname || name,
          campId: name,
          area: "wechat",
          currentRank: result.profile.currentRank,
          currentStars: result.profile.currentStars,
        },
      ];
    }
    throw new WzryApiError(
      "当前第三方接口需使用营地 ID 查询。请输入营地号，或切换 WZRY_API_PROVIDER=mock 用昵称演示",
      "config",
    );
  }

  async fetchBattles(campId: string, options?: { num?: number; nickname?: string }): Promise<FetchResult> {
    const num = options?.num ?? 30;
    const url = new URL(this.baseUrl);
    url.searchParams.set("type", "json");
    url.searchParams.set("num", String(num));
    url.searchParams.set("id", campId);
    if (this.apiKey) url.searchParams.set("key", this.apiKey);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
    } catch {
      throw new WzryApiError("第三方接口请求失败，请稍后重试", "upstream");
    }

    if (res.status === 429) {
      throw new WzryApiError("请求过于频繁，请稍后再试", "rate_limit");
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new WzryApiError("第三方接口返回异常", "upstream");

    const code = String(data.code ?? "");
    const msg = String(data.msg || data.message || "");

    if (code === "201" || code === "404") {
      if (msg.includes("隐藏")) {
        throw new WzryApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
      }
      throw new WzryApiError(msg || "未找到该玩家", "not_found");
    }

    const list: unknown[] = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.list)
          ? data.list
          : [];

    if (!list.length && code !== "200") {
      throw new WzryApiError(msg || "未获取到战绩数据", "upstream");
    }

    const matches: NormalizedMatch[] = list.map((item, idx) => {
      const row = item as Record<string, unknown>;
      const mapName = String(row.mapName || row.map_name || "未知模式");
      const result = parseResult(String(row.result || ""));
      const heroName = String(row.heroName || row.desc || row.hero || "未知英雄");
      const gametime = String(row.gametime || row.gameTime || row.time || "");
      const playedAt = gametime
        ? new Date(gametime.replace(/-/g, "/"))
        : new Date(Date.now() - idx * 3600000);
      const kills = Number(row.killcnt || row.kills || 0);
      const deaths = Number(row.deadcnt || row.deaths || 0);
      const assists = Number(row.assistcnt || row.assists || 0);
      const rankName = String(row.roleJobName || row.rankName || "") || undefined;
      const stars = Number(row.stars || 0) || undefined;
      const evaluate = String(row.desc || row.evaluate || "") || undefined;
      const heroId = String(row.heroId || "") || undefined;
      const heroIcon = String(row.heroIcon || "") || undefined;
      const durationRaw = String(row.time || "");
      let durationSec: number | undefined;
      const dm = durationRaw.match(/(\d+)/g);
      if (dm && durationRaw.includes("分")) {
        durationSec = Number(dm[0]) * 60 + (dm[1] ? Number(dm[1]) : 0);
      }

      return {
        externalId: `${campId}-${playedAt.getTime()}-${heroName}-${kills}-${deaths}-${assists}`,
        playedAt: Number.isNaN(playedAt.getTime()) ? new Date() : playedAt,
        mode: detectMode(mapName),
        modeName: mapName,
        heroId,
        heroName,
        heroIcon,
        result,
        kills,
        deaths,
        assists,
        evaluate,
        durationSec,
        rankName,
        stars,
        mvp: evaluate?.includes("MVP") || Boolean(row.mvpUrlV2),
        gold: Boolean(row.evaluateUrl) && evaluate?.includes("金"),
        rawJson: JSON.stringify(row),
      };
    });

    const first = list[0] as Record<string, unknown> | undefined;
    return {
      profile: {
        campId,
        gameNickname: options?.nickname || String(first?.roleName || first?.nickname || `营地${campId}`),
        gameAvatarUrl: String(first?.heroIcon || "") || undefined,
        currentRank: String(first?.roleJobName || "未知"),
        currentStars: Number(first?.stars || 0),
        seasonGames: matches.length,
        seasonWins: matches.filter((m) => m.result === "win").length,
        mvpCount: matches.filter((m) => m.mvp).length,
        goldCount: matches.filter((m) => m.gold).length,
      },
      matches,
    };
  }
}

/**
 * 山海云端 Apibyte：https://apione.apibyte.cn/wzry
 * action=query|user|battle，Header: X-Api-Key
 */
export class ApibyteWzryApiClient implements WzryApiClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private async request(params: Record<string, string>) {
    const url = new URL(this.baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v) url.searchParams.set(k, v);
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) headers["X-Api-Key"] = this.apiKey;

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers,
        cache: "no-store",
      });
    } catch {
      throw new WzryApiError("山海云端接口请求失败，请稍后重试", "upstream");
    }

    if (res.status === 429) {
      throw new WzryApiError("请求过于频繁，请稍后再试", "rate_limit");
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new WzryApiError("山海云端接口返回异常", "upstream");

    const code = Number(data.code ?? res.status);
    const msg = String(data.msg || data.message || "");

    if (code === 429) throw new WzryApiError(msg || "请求过于频繁", "rate_limit");
    if (code === 401 || code === 403) {
      throw new WzryApiError(msg || "API Key 无效或额度不足", "config");
    }
    if (code !== 200) {
      if (msg.includes("隐藏")) {
        throw new WzryApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
      }
      if (msg.includes("登录态") || msg.includes("重新登录")) {
        throw new WzryApiError(
          "第三方上游登录态失效，请稍后重试或到山海云端控制台检查接口状态",
          "upstream",
        );
      }
      if (code === 404 || msg.includes("未找到") || msg.includes("不存在")) {
        throw new WzryApiError(msg || "未找到该玩家", "not_found");
      }
      throw new WzryApiError(msg || `接口错误 (${code})`, "upstream");
    }

    return data.data;
  }

  private parseArea(region?: string, rank?: string): "wechat" | "qq" {
    const s = `${region || ""} ${rank || ""}`;
    if (s.includes("微信") || s.includes("Wx") || s.includes("wx")) return "wechat";
    if (s.includes("Q") || s.includes("手Q") || s.includes("QQ")) return "qq";
    return "wechat";
  }

  private parseRankStars(rankText?: string): { rankName: string; stars: number } {
    const text = (rankText || "未知").trim();
    // e.g. "手Q安卓 白银II" / "王者50星"
    const starMatch = text.match(/(\d+)\s*星/);
    const stars = starMatch ? Number(starMatch[1]) : 0;
    // take last segment after space if present
    const parts = text.split(/\s+/);
    const rankName = parts[parts.length - 1] || text;
    return { rankName, stars };
  }

  async searchByNickname(nickname: string): Promise<PlayerSearchHit[]> {
    const name = nickname.trim();
    if (!name) throw new WzryApiError("请输入王者名称", "invalid_id");

    const data = await this.request({ action: "query", name });
    const players = Array.isArray(data?.players)
      ? data.players
      : Array.isArray(data)
        ? data
        : [];

    if (!players.length) {
      throw new WzryApiError("未找到该玩家，请确认王者名称或营地 ID", "not_found");
    }

    return players
      .map((p: Record<string, unknown>) => {
        const rankText = String(p.rank || p.roleJobName || "");
        const { rankName, stars } = this.parseRankStars(rankText);
        const campNickname = String(p.nickname || "");
        const roleName = String(p.role_name || "");
        return {
          gameNickname: roleName || campNickname || name,
          campNickname: campNickname || undefined,
          campId: String(p.uid || p.userId || ""),
          area: this.parseArea(String(p.region || ""), rankText),
          currentRank: rankName,
          currentStars: stars,
        };
      })
      .filter((h: PlayerSearchHit) => Boolean(h.campId));
  }

  async fetchBattles(
    campId: string,
    options?: { num?: number; nickname?: string },
  ): Promise<FetchResult> {
    const [userData, battleData] = await Promise.all([
      this.request({ action: "user", uid: campId }).catch(() => null),
      this.request({ action: "battle", uid: campId }),
    ]);

    const battles: unknown[] = Array.isArray(battleData?.battles)
      ? battleData.battles
      : Array.isArray(battleData)
        ? battleData
        : Array.isArray(battleData?.list)
          ? battleData.list
          : [];

    const matches: NormalizedMatch[] = battles.map((item, idx) => {
      const row = item as Record<string, unknown>;
      const mapName = String(
        row.mapName || row.map_name || row.mode || row.game_type || row.type || "未知模式",
      );
      const resultRaw = String(row.result || row.win || row.isWin || "");
      const result: "win" | "lose" =
        resultRaw === "1" ||
        resultRaw === "true" ||
        resultRaw.includes("胜") ||
        resultRaw.toLowerCase() === "win"
          ? "win"
          : "lose";

      const heroName = String(
        row.heroName || row.hero_name || row.hero || row.chessName || "未知英雄",
      );
      const timeRaw = String(
        row.gametime || row.gameTime || row.time || row.battle_time || row.datetime || "",
      );
      let playedAt = timeRaw
        ? new Date(timeRaw.includes("-") ? timeRaw.replace(/-/g, "/") : Number(timeRaw) * (String(timeRaw).length === 10 ? 1000 : 1))
        : new Date(Date.now() - idx * 3600000);
      if (Number.isNaN(playedAt.getTime())) playedAt = new Date(Date.now() - idx * 3600000);

      const kills = Number(row.killcnt ?? row.kills ?? row.kill ?? 0);
      const deaths = Number(row.deadcnt ?? row.deaths ?? row.death ?? 0);
      const assists = Number(row.assistcnt ?? row.assists ?? row.assist ?? 0);
      const score = row.score != null ? Number(row.score) : row.grade != null ? Number(row.grade) : undefined;
      const evaluate = String(row.desc || row.evaluate || row.rankTitle || row.rank_title || "") || undefined;
      const rankText = String(row.roleJobName || row.rankName || row.rank || "") || undefined;
      const stars = row.stars != null ? Number(row.stars) : undefined;
      const heroId = row.heroId != null ? String(row.heroId) : row.hero_id != null ? String(row.hero_id) : undefined;
      const heroIcon = String(row.heroIcon || row.hero_icon || row.icon || "") || undefined;
      const durationSec =
        row.durationSec != null
          ? Number(row.durationSec)
          : row.usedTime != null
            ? Number(row.usedTime)
            : row.time_cost != null
              ? Number(row.time_cost)
              : undefined;

      return {
        externalId: String(
          row.gameSeq ||
            row.battleId ||
            row.id ||
            `${campId}-${playedAt.getTime()}-${heroName}-${kills}-${deaths}-${assists}`,
        ),
        playedAt,
        mode: detectMode(mapName),
        modeName: mapName,
        heroId,
        heroName,
        heroIcon,
        result,
        kills,
        deaths,
        assists,
        score: Number.isFinite(score as number) ? score : undefined,
        evaluate,
        durationSec: Number.isFinite(durationSec as number) ? durationSec : undefined,
        rankName: rankText,
        stars,
        mvp: Boolean(row.mvp) || evaluate?.includes("MVP") || false,
        gold: Boolean(row.gold) || evaluate?.includes("金") || false,
        economy: row.economy != null ? Number(row.economy) : undefined,
        damage: row.damage != null ? Number(row.damage) : row.hurtTotal != null ? Number(row.hurtTotal) : undefined,
        rawJson: JSON.stringify(row),
      };
    });

    const stats = (userData?.stats || userData || {}) as Record<string, unknown>;
    const rankText = String(
      userData?.rank || userData?.roleJobName || stats.rank || battleData?.rank || "",
    );
    const { rankName, stars } = this.parseRankStars(rankText);

    const gameNickname =
      options?.nickname ||
      String(userData?.name || userData?.role_name || userData?.nickname || `营地${campId}`);

    const seasonGames = Number(
      stats.totalCount ?? stats.games ?? stats.battle_count ?? matches.length,
    );
    const winRateRaw = stats.winRate ?? stats.win_rate;
    let seasonWins = Number(stats.winCount ?? stats.wins ?? 0);
    if (!seasonWins && winRateRaw != null && seasonGames) {
      const wr =
        typeof winRateRaw === "string" && winRateRaw.includes("%")
          ? parseFloat(winRateRaw)
          : Number(winRateRaw);
      if (Number.isFinite(wr)) {
        seasonWins = Math.round((wr > 1 ? wr / 100 : wr) * seasonGames);
      }
    }
    if (!seasonWins) seasonWins = matches.filter((m) => m.result === "win").length;

    return {
      profile: {
        campId,
        gameNickname,
        gameAvatarUrl: String(userData?.avatar || userData?.gameAvatarUrl || "") || undefined,
        currentRank: rankName || "未知",
        currentStars: stars,
        seasonGames: seasonGames || matches.length,
        seasonWins,
        mvpCount: Number(stats.mvpNum ?? stats.mvp ?? matches.filter((m) => m.mvp).length),
        goldCount: Number(stats.goldNum ?? stats.gold ?? matches.filter((m) => m.gold).length),
        area: this.parseArea(String(userData?.region || ""), rankText),
      },
      matches: options?.num ? matches.slice(0, options.num) : matches,
    };
  }
}

/**
 * 极数本源 ApiZero：https://v1.apizero.cn/api/wzry-battle
 * action=search|roles|battles，POST + Header: X-Api-Key
 * campId 编码为 `userId:roleId`
 */
export class ApizeroWzryApiClient implements WzryApiClient {
  constructor(
    private baseUrl: string,
    private apiKey?: string,
  ) {}

  private async request(body: Record<string, unknown>) {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (this.apiKey) headers["X-Api-Key"] = this.apiKey;

    let res: Response;
    try {
      res = await fetch(this.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new WzryApiError("ApiZero 接口请求失败，请稍后重试", "upstream");
    }

    if (res.status === 429) {
      throw new WzryApiError("请求过于频繁，请稍后再试", "rate_limit");
    }

    const data = await res.json().catch(() => null);
    if (!data) throw new WzryApiError("ApiZero 接口返回异常", "upstream");

    const code = Number(data.code ?? res.status);
    const msg = String(data.msg || data.message || "");

    if (res.status === 401 || res.status === 403 || code === 401 || code === 403) {
      throw new WzryApiError(msg || "API Key 无效或额度不足", "config");
    }
    if (code === 429 || res.status === 429) {
      throw new WzryApiError(msg || "请求过于频繁", "rate_limit");
    }
    // 上游营地 Session 过期等（实测 code=5020）
    if (code === 5020 || msg.includes("Session") || msg.includes("session")) {
      throw new WzryApiError(
        "第三方上游营地登录态失效，请稍后重试或到 ApiZero 控制台检查接口状态",
        "upstream",
      );
    }
    if (code !== 200) {
      if (msg.includes("隐藏")) {
        throw new WzryApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
      }
      if (code === 404 || msg.includes("未找到") || msg.includes("不存在")) {
        throw new WzryApiError(msg || "未找到该玩家", "not_found");
      }
      throw new WzryApiError(msg || `接口错误 (${code})`, "upstream");
    }

    return data.data;
  }

  private parseArea(text?: string): "wechat" | "qq" {
    const s = text || "";
    if (s.includes("微信") || /wx/i.test(s)) return "wechat";
    if (s.includes("Q") || s.includes("手Q") || /qq/i.test(s)) return "qq";
    return "wechat";
  }

  private parseCampId(campId: string): { userId: string; roleId?: string } {
    const idx = campId.indexOf(":");
    if (idx > 0) {
      return { userId: campId.slice(0, idx), roleId: campId.slice(idx + 1) || undefined };
    }
    return { userId: campId };
  }

  private asList(data: unknown, ...keys: string[]): Record<string, unknown>[] {
    if (Array.isArray(data)) return data as Record<string, unknown>[];
    if (!data || typeof data !== "object") return [];
    const obj = data as Record<string, unknown>;
    for (const k of keys) {
      if (Array.isArray(obj[k])) return obj[k] as Record<string, unknown>[];
    }
    return [];
  }

  private encodeCampId(userId: string, roleId: string) {
    return `${userId}:${roleId}`;
  }

  async searchByNickname(nickname: string): Promise<PlayerSearchHit[]> {
    const name = nickname.trim();
    if (!name) throw new WzryApiError("请输入王者名称", "invalid_id");

    // 纯数字：当作 userId，直接拉角色
    if (/^\d{5,15}$/.test(name)) {
      return this.hitsFromRoles(name, name);
    }

    const data = await this.request({ action: "search", keyword: name });
    const players = this.asList(data, "player_list", "players", "list", "items");

    if (!players.length) {
      throw new WzryApiError("未找到该玩家，请确认王者名称", "not_found");
    }

    const nickOf = (p: Record<string, unknown>) =>
      String(p.nickname || p.nickName || p.name || p.user_name || "");

    const exact = players.filter((p) => {
      const n = nickOf(p);
      return n === name || n.toLowerCase() === name.toLowerCase();
    });
    const candidates = (exact.length ? exact : players).slice(0, 3);

    const hits: PlayerSearchHit[] = [];
    for (const p of candidates) {
      const userId = String(p.user_id || p.userId || p.uid || p.id || "");
      if (!userId) continue;
      const campNick = nickOf(p) || name;
      const roleHits = await this.hitsFromRoles(userId, campNick);
      hits.push(...roleHits);
    }

    if (!hits.length) {
      throw new WzryApiError("未找到该玩家的游戏角色", "not_found");
    }
    return hits;
  }

  private async hitsFromRoles(userId: string, campNickname: string): Promise<PlayerSearchHit[]> {
    const data = await this.request({ action: "roles", user_id: userId });
    const roles = this.asList(data, "role_list", "roles", "list", "items");
    if (!roles.length) return [];

    return roles
      .map((role) => {
        const roleId = String(role.role_id || role.roleId || role.id || "");
        const roleName = String(role.role_name || role.roleName || role.name || campNickname);
        const areaText = String(role.area || role.region || role.zone || "");
        const rankText = String(role.level || role.rank || role.roleJobName || "");
        const starMatch = rankText.match(/(\d+)\s*星/);
        return {
          gameNickname: roleName,
          campNickname,
          campId: this.encodeCampId(userId, roleId),
          area: this.parseArea(areaText || rankText),
          currentRank: rankText || undefined,
          currentStars: starMatch ? Number(starMatch[1]) : undefined,
        } satisfies PlayerSearchHit;
      })
      .filter((h) => Boolean(h.campId.split(":")[1]));
  }

  async fetchBattles(
    campId: string,
    options?: { num?: number; nickname?: string },
  ): Promise<FetchResult> {
    let { userId, roleId } = this.parseCampId(campId);

    if (!roleId) {
      const rolesData = await this.request({ action: "roles", user_id: userId });
      const roles = this.asList(rolesData, "role_list", "roles", "list", "items");
      roleId = String(roles[0]?.role_id || roles[0]?.roleId || roles[0]?.id || "");
      if (!roleId) throw new WzryApiError("未找到该玩家的游戏角色", "not_found");
    }

    const want = options?.num ?? 60;
    const pages = Math.min(3, Math.max(1, Math.ceil(want / 30)));

    const battleData = await this.request({
      action: "battles",
      user_id: userId,
      role_id: roleId,
      last_time: 0,
      option: 0,
      pages,
    });

    const battles = this.asList(battleData, "battle_list", "battles", "list", "items");
    const encodedId = this.encodeCampId(userId, roleId);

    const matches: NormalizedMatch[] = battles.map((row, idx) => {
      const mapName = String(
        row.mapName || row.map_name || row.mode || row.game_type || row.gametype || row.type || "未知模式",
      );
      const resultRaw = String(row.result || row.win || row.isWin || row.gameresult || "");
      const result: "win" | "lose" =
        resultRaw === "1" ||
        resultRaw === "true" ||
        resultRaw.includes("胜") ||
        resultRaw.toLowerCase() === "win"
          ? "win"
          : "lose";

      const heroName = String(
        row.heroName || row.hero_name || row.hero || row.chessName || row.desc || "未知英雄",
      );
      const timeRaw =
        row.dteventtime ??
        row.gametime ??
        row.gameTime ??
        row.battle_time ??
        row.time ??
        row.datetime ??
        "";
      let playedAt: Date;
      if (typeof timeRaw === "number" || /^\d+$/.test(String(timeRaw))) {
        const n = Number(timeRaw);
        playedAt = new Date(String(timeRaw).length === 10 ? n * 1000 : n);
      } else if (timeRaw) {
        playedAt = new Date(String(timeRaw).replace(/-/g, "/"));
      } else {
        playedAt = new Date(Date.now() - idx * 3600000);
      }
      if (Number.isNaN(playedAt.getTime())) playedAt = new Date(Date.now() - idx * 3600000);

      const kills = Number(row.killcnt ?? row.kills ?? row.kill ?? 0);
      const deaths = Number(row.deadcnt ?? row.deaths ?? row.death ?? 0);
      const assists = Number(row.assistcnt ?? row.assists ?? row.assist ?? 0);
      const score =
        row.score != null ? Number(row.score) : row.grade != null ? Number(row.grade) : undefined;
      const evaluate =
        String(row.desc || row.evaluate || row.rankTitle || row.rank_title || "") || undefined;
      const rankText =
        String(row.roleJobName || row.rankName || row.rank || "") || undefined;
      const stars = row.stars != null ? Number(row.stars) : undefined;
      const heroId =
        row.heroId != null
          ? String(row.heroId)
          : row.hero_id != null
            ? String(row.hero_id)
            : undefined;
      const heroIcon = String(row.heroIcon || row.hero_icon || row.icon || "") || undefined;
      const durationSec =
        row.durationSec != null
          ? Number(row.durationSec)
          : row.usedTime != null
            ? Number(row.usedTime)
            : row.time_cost != null
              ? Number(row.time_cost)
              : undefined;

      return {
        externalId: String(
          row.gameSeq ||
            row.battleId ||
            row.battle_id ||
            row.id ||
            `${encodedId}-${playedAt.getTime()}-${heroName}-${kills}-${deaths}-${assists}`,
        ),
        playedAt,
        mode: detectMode(mapName),
        modeName: mapName,
        heroId,
        heroName,
        heroIcon,
        result,
        kills,
        deaths,
        assists,
        score: Number.isFinite(score as number) ? score : undefined,
        evaluate,
        durationSec: Number.isFinite(durationSec as number) ? durationSec : undefined,
        rankName: rankText,
        stars,
        mvp: Boolean(row.mvp) || evaluate?.includes("MVP") || false,
        gold: Boolean(row.gold) || evaluate?.includes("金") || false,
        economy: row.economy != null ? Number(row.economy) : undefined,
        damage:
          row.damage != null
            ? Number(row.damage)
            : row.hurtTotal != null
              ? Number(row.hurtTotal)
              : undefined,
        rawJson: JSON.stringify(row),
      };
    });

    const profileSrc = (battleData || {}) as Record<string, unknown>;
    const rankFromBattle = String(
      profileSrc.rank || profileSrc.roleJobName || matches[0]?.rankName || "",
    );
    const starMatch = rankFromBattle.match(/(\d+)\s*星/);

    return {
      profile: {
        campId: encodedId,
        gameNickname: options?.nickname || String(profileSrc.role_name || profileSrc.nickname || `营地${userId}`),
        gameAvatarUrl: String(profileSrc.avatar || profileSrc.avatar_url || "") || undefined,
        currentRank: rankFromBattle || matches[0]?.rankName || "未知",
        currentStars: starMatch ? Number(starMatch[1]) : matches[0]?.stars || 0,
        seasonGames: matches.length,
        seasonWins: matches.filter((m) => m.result === "win").length,
        mvpCount: matches.filter((m) => m.mvp).length,
        goldCount: matches.filter((m) => m.gold).length,
      },
      matches: options?.num ? matches.slice(0, options.num) : matches,
    };
  }
}

import { CampWzryApiClient } from "./camp/camp-client";

export function getWzryApiClient(): WzryApiClient {
  const provider = (process.env.WZRY_API_PROVIDER || "mock").toLowerCase();
  if (provider === "camp" || provider === "kohcamp") {
    return new CampWzryApiClient();
  }
  if (provider === "apizero" || provider === "zero") {
    const base = process.env.WZRY_API_BASE_URL || "https://v1.apizero.cn/api/wzry-battle";
    return new ApizeroWzryApiClient(base, process.env.WZRY_API_KEY || undefined);
  }
  if (provider === "apibyte" || provider === "shanhai") {
    const base = process.env.WZRY_API_BASE_URL || "https://apione.apibyte.cn/wzry";
    return new ApibyteWzryApiClient(base, process.env.WZRY_API_KEY || undefined);
  }
  if (provider === "yujn") {
    const base = process.env.WZRY_API_BASE_URL || "https://api.yujn.cn/api/wzzj.php";
    return new YujnWzryApiClient(base, process.env.WZRY_API_KEY || undefined);
  }
  return new MockWzryApiClient();
}

export { detectMode, parseResult };
