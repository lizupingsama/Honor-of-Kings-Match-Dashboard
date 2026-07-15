import {
  CampApiError,
  getMoreBattleList,
  getProfile,
  getSeasonpage,
} from "./camp-api";
import { resolveHeroName, stripControlChars } from "./hero-list";
import {
  detectMode,
  type FetchResult,
  type NormalizedMatch,
  type PlayerSearchHit,
  type WzryApiClient,
  WzryApiError,
} from "../wzry-api";

function mapCampError(err: unknown): never {
  if (err instanceof CampApiError) {
    if (err.code === "auth") {
      throw new WzryApiError(
        err.message.includes("管理后台")
          ? err.message
          : `${err.message}。请到管理后台扫码登录营地`,
        "config",
      );
    }
    if (err.code === "hidden") {
      throw new WzryApiError(err.message, "hidden");
    }
    if (err.code === "not_found") {
      throw new WzryApiError(err.message, "not_found");
    }
    if (err.code === "rate_limit") {
      throw new WzryApiError(err.message, "rate_limit");
    }
    throw new WzryApiError(err.message, "upstream");
  }
  if (err instanceof WzryApiError) throw err;
  throw new WzryApiError(
    err instanceof Error ? err.message : "营地接口请求失败",
    "upstream",
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asList(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [];
}

function parseArea(text?: string): "wechat" | "qq" {
  const s = text || "";
  if (s.includes("微信") || /wx/i.test(s)) return "wechat";
  if (s.includes("Q") || s.includes("手Q") || /qq/i.test(s)) return "qq";
  return "wechat";
}

function parseRankFromProfile(data: Record<string, unknown>) {
  const head = asRecord(data.head);
  const mods = asList(head?.mods);
  const mode5v5 =
    mods.find((m) => Number(m.modId) === 701) ||
    mods.find((m) => String(m.name || "").includes("排位"));

  let rankName = "";
  let stars = 0;

  if (mode5v5) {
    rankName = String(mode5v5.name || "");
    try {
      const param1 = JSON.parse(String(mode5v5.param1 || "{}")) as { rankingStar?: number };
      stars = Number(param1.rankingStar || 0);
      // 星数单独存 currentStars，不写进段位名，避免展示重复「N星」
      rankName = rankName.replace(/\s*\d+\s*星\s*$/u, "").trim();
    } catch {
      // ignore
    }
  }

  return { rankName: rankName || "未知", stars };
}

function extractRole(profilePayload: Record<string, unknown>) {
  const data = asRecord(profilePayload.data) || profilePayload;
  const targetRoleId = String(data.targetRoleId || "");
  const roles = asList(data.roleList);
  const role = roles.find((r) => String(r.roleId) === targetRoleId) || roles[0] || null;
  return { data, role };
}

function parseSeasonStats(seasonPayload: Record<string, unknown>) {
  const data = asRecord(seasonPayload.data) || seasonPayload;
  const history = asList(data.historyList);
  const current = history[0] || null;
  const rankInfo = asRecord(current?.rankInfo);
  if (!rankInfo) return null;

  const seasonGames = Number(rankInfo.totalCnt ?? 0);
  const seasonWins = Number(rankInfo.totalWinCnt ?? 0);
  if (!Number.isFinite(seasonGames) || seasonGames <= 0) return null;

  return {
    seasonGames,
    seasonWins: Number.isFinite(seasonWins) ? seasonWins : 0,
    goldCount: Number(rankInfo.goldCnt ?? 0) || undefined,
  };
}

export function parseBattleHonors(row: Record<string, unknown>) {
  const evaluate = String(row.desc || row.evaluate || "") || undefined;
  const urlBlob = [
    row.evaluateUrl,
    row.evaluateUrlV2,
    row.evaluateUrlV3,
    row.mvpUrlV2,
    row.mvpUrlV3,
  ]
    .map((u) => String(u || ""))
    .join(" ");

  let mvpType: "mvp" | "svp" | undefined;
  if (/\/svp\.png/i.test(urlBlob) || /\bsvp\b/i.test(urlBlob)) mvpType = "svp";
  else if (
    /\/mvp\.png/i.test(urlBlob) ||
    Boolean(row.mvp) ||
    (evaluate?.includes("MVP") ?? false)
  ) {
    mvpType = "mvp";
  }

  /** evaluateUrlV3 官方分路奖牌图（比 silver_/gold_ 文件名更准，可区分铜/银） */
  const EVALUATE_V3_MEDALS: Record<string, string> = {
    "116bb42c52b7d83b9d80ac9dd9580607": "银牌对抗路",
    e8602ae4b427f06dd1349438fbeab68f: "铜牌对抗路",
    c30089b8daf9a4792f85c8a6d97a3e9c: "金牌对抗路",
    a2c96893471637e5cf5c0a1e2c9829f3: "银牌中路",
    "977937945942799fd618773e5c378d3a": "银牌游走",
    "3159d2f1733203167a9a3d5d3e4656ad": "铜牌游走",
    c717aab51e99a4bfa9c6d2e024e97512: "金牌发育路",
  };

  const medalIcon = String(row.evaluateUrlV3 || "") || undefined;
  const v3Hash = medalIcon?.split("/").pop()?.replace(/\.png$/i, "") || "";
  let medal = (v3Hash && EVALUATE_V3_MEDALS[v3Hash]) || undefined;

  if (!medal) {
    const medalMatch = urlBlob.match(
      /\b(gold|silver|bronze)[-_](warrior|mage|assassin|support|shooter|archer|tank)\b/i,
    );
    const BRANCH: Record<number, string> = {
      1: "对抗路",
      2: "打野",
      3: "发育路",
      4: "中路",
      5: "游走",
      10: "游走",
    };
    const CLASS: Record<string, string> = {
      warrior: "战士",
      mage: "法师",
      assassin: "刺客",
      support: "辅助",
      shooter: "射手",
      archer: "射手",
      tank: "坦克",
    };
    const TIER: Record<string, string> = {
      gold: "金牌",
      silver: "银牌",
      bronze: "铜牌",
    };
    if (medalMatch) {
      const tier = TIER[medalMatch[1].toLowerCase()] || "";
      const branchNum = Number(row.branchEvaluate);
      const role =
        (Number.isFinite(branchNum) && BRANCH[branchNum]) ||
        CLASS[medalMatch[2].toLowerCase()] ||
        "";
      if (tier && role) medal = `${tier}${role}`;
    }
  }

  const gold =
    Boolean(row.gold) ||
    Boolean(medal?.startsWith("金牌")) ||
    /[-_]gold[-_]|\/gold_/i.test(urlBlob);

  return {
    evaluate,
    mvp: Boolean(mvpType),
    mvpType,
    gold,
    medal,
    medalIcon,
  };
}

function parsePlayedAt(row: Record<string, unknown>, idx: number): Date {
  // 优先 unix 时间戳；gametime 可能是 "12:44" 或 "07-14 12:47"，不可靠
  const timeRaw = row.dtEventTime ?? row.dteventtime ?? row.battle_time ?? "";
  if (typeof timeRaw === "number" || /^\d+$/.test(String(timeRaw))) {
    const n = Number(timeRaw);
    const playedAt = new Date(String(timeRaw).length === 10 ? n * 1000 : n);
    if (!Number.isNaN(playedAt.getTime())) return playedAt;
  }

  const gameTime = String(row.gametime || row.gameTime || "");
  if (gameTime && !/^\d{1,2}:\d{2}$/.test(gameTime)) {
    const playedAt = new Date(gameTime.replace(/-/g, "/"));
    if (!Number.isNaN(playedAt.getTime())) return playedAt;
  }

  return new Date(Date.now() - idx * 3600000);
}

async function mapBattleRow(
  row: Record<string, unknown>,
  campId: string,
  idx: number,
): Promise<NormalizedMatch> {
  const mapName = String(row.mapName || row.map_name || "未知模式");
  const resultRaw = row.gameresult ?? row.gameResult ?? row.result;
  const result: "win" | "lose" =
    resultRaw === 1 ||
    resultRaw === "1" ||
    String(resultRaw).includes("胜") ||
    String(resultRaw).toLowerCase() === "win"
      ? "win"
      : "lose";

  const heroId =
    row.heroId != null
      ? String(row.heroId)
      : row.hero_id != null
        ? String(row.hero_id)
        : undefined;
  const resolvedName = await resolveHeroName(heroId);
  const heroName =
    resolvedName ||
    String(row.heroName || row.hero_name || row.chessName || "") ||
    (heroId ? `英雄${heroId}` : "未知英雄");

  const playedAt = parsePlayedAt(row, idx);
  const kills = Number(row.killcnt ?? row.kills ?? 0);
  const deaths = Number(row.deadcnt ?? row.deaths ?? 0);
  const assists = Number(row.assistcnt ?? row.assists ?? 0);
  const score =
    row.gradeGame != null
      ? Number(row.gradeGame)
      : row.score != null
        ? Number(row.score)
        : undefined;
  const honors = parseBattleHonors(row);
  const rankText = String(row.roleJobName || row.rankName || "") || undefined;
  const stars =
    row.stars != null
      ? Number(row.stars)
      : (() => {
          const m = rankText?.match(/(\d+)\s*星/);
          return m ? Number(m[1]) : undefined;
        })();
  const heroIcon = String(row.heroIcon || row.hero_icon || "") || undefined;
  const durationSec =
    row.usedTime != null
      ? Number(row.usedTime)
      : row.durationSec != null
        ? Number(row.durationSec)
        : undefined;

  const newPeak =
    row.newMasterMatchScore != null ? Number(row.newMasterMatchScore) : NaN;
  const oldPeak =
    row.oldMasterMatchScore != null ? Number(row.oldMasterMatchScore) : NaN;
  const peakScore =
    Number.isFinite(newPeak) && newPeak > 0
      ? newPeak
      : (() => {
          const fallback = row.peakScore != null ? Number(row.peakScore) : NaN;
          return Number.isFinite(fallback) && fallback > 0 ? fallback : undefined;
        })();
  const peakDelta =
    Number.isFinite(newPeak) && Number.isFinite(oldPeak)
      ? newPeak - oldPeak
      : undefined;

  const campRaw = row.AcntCamp ?? row.acntCamp ?? row.acnt_camp;
  const campNum = campRaw != null ? Number(campRaw) : NaN;
  const side: "blue" | "red" | undefined =
    campNum === 1 ? "blue" : campNum === 2 ? "red" : undefined;

  return {
    externalId: String(
      row.gameSeq ||
        row.battleId ||
        row.battle_id ||
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
    evaluate: honors.evaluate,
    durationSec: Number.isFinite(durationSec as number) ? durationSec : undefined,
    rankName: rankText,
    stars: Number.isFinite(stars as number) ? stars : undefined,
    peakScore,
    peakDelta,
    mvp: honors.mvp,
    gold: honors.gold,
    medal: honors.medal,
    medalIcon: honors.medalIcon,
    mvpType: honors.mvpType,
    side,
    economy: row.economy != null ? Number(row.economy) : undefined,
    damage:
      row.hurtTotal != null
        ? Number(row.hurtTotal)
        : row.damage != null
          ? Number(row.damage)
          : undefined,
    rawJson: JSON.stringify(row),
  };
}

export class CampWzryApiClient implements WzryApiClient {
  async searchByNickname(nickname: string): Promise<PlayerSearchHit[]> {
    const id = nickname.trim();
    if (!/^\d{5,15}$/.test(id)) {
      throw new WzryApiError("请输入 5–15 位数字营地 ID", "invalid_id");
    }

    try {
      const profileRes = await getProfile(id);
      const { data, role } = extractRole(profileRes);
      if (!role) {
        throw new WzryApiError("未找到该营地 ID 对应的游戏角色", "not_found");
      }

      const { rankName, stars } = parseRankFromProfile(data);
      const areaText = String(role.areaName || role.roleText || "");
      const gameNickname = stripControlChars(
        String(role.roleName || role.nickname || `营地${id}`),
      );

      return [
        {
          gameNickname,
          campId: id,
          campNickname: gameNickname,
          area: parseArea(areaText),
          currentRank: rankName,
          currentStars: stars,
        },
      ];
    } catch (err) {
      mapCampError(err);
    }
  }

  async fetchBattles(
    campId: string,
    options?: { num?: number; nickname?: string },
  ): Promise<FetchResult> {
    const userId = campId.includes(":") ? campId.split(":")[0] : campId.trim();
    if (!/^\d{5,15}$/.test(userId)) {
      throw new WzryApiError("营地 ID 无效", "invalid_id");
    }

    try {
      const [profileRes, battleRes] = await Promise.all([
        getProfile(userId),
        getMoreBattleList(userId),
      ]);

      const { data, role } = extractRole(profileRes);
      if (!role) {
        throw new WzryApiError("未找到该营地 ID 对应的游戏角色", "not_found");
      }

      const roleId = String(role.roleId || "");
      let seasonStats: ReturnType<typeof parseSeasonStats> = null;
      if (roleId) {
        try {
          const seasonRes = await getSeasonpage(roleId);
          seasonStats = parseSeasonStats(seasonRes as Record<string, unknown>);
        } catch {
          // 赛季页失败时回退到近期战绩统计
        }
      }

      const { rankName, stars } = parseRankFromProfile(data);
      const areaText = String(role.areaName || role.roleText || "");
      const gameNickname = stripControlChars(
        options?.nickname || String(role.roleName || role.nickname || `营地${userId}`),
      );
      const avatar = String(role.roleIcon || role.avatar || "") || undefined;

      const battleData = asRecord(battleRes.data) || battleRes;
      const battles = asList(battleData.list || battleData.battle_list);

      const matches = await Promise.all(
        battles.map((row, idx) => mapBattleRow(row, userId, idx)),
      );
      const limited = options?.num ? matches.slice(0, options.num) : matches;

      return {
        profile: {
          campId: userId,
          gameNickname,
          gameAvatarUrl: avatar,
          currentRank: rankName || limited[0]?.rankName || "未知",
          currentStars: stars || limited[0]?.stars || 0,
          seasonGames: seasonStats?.seasonGames ?? limited.length,
          seasonWins:
            seasonStats?.seasonWins ?? limited.filter((m) => m.result === "win").length,
          mvpCount: limited.filter((m) => m.mvp).length,
          goldCount:
            seasonStats?.goldCount ?? limited.filter((m) => m.gold).length,
          area: parseArea(areaText),
        },
        matches: limited,
      };
    } catch (err) {
      mapCampError(err);
    }
  }
}
