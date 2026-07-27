import {
  CampApiError,
  CAMP_BATTLE_SYNC_MAX_MATCHES,
  CAMP_BATTLE_SYNC_MAX_PAGES,
  fetchMoreBattleListPages,
  getBattleDetail,
  getMoreBattleList,
  getProfile,
  getSeasonpage,
} from "./camp-api";
import { resolveHeroName, stripControlChars } from "./hero-list";
import {
  detectMode,
  type FetchResult,
  type MatchEquip,
  type NormalizedMatch,
  type PlayerSearchHit,
  type WzryApiClient,
  WzryApiError,
} from "../wzry-api";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
  const masterInfo = asRecord(current?.masterInfo);
  const headCard = asRecord(data.headCard);
  if (!rankInfo && !masterInfo && !headCard) return null;

  const seasonGames = Number(rankInfo?.totalCnt ?? 0);
  const seasonWins = Number(rankInfo?.totalWinCnt ?? 0);
  const rankAvg = Number(rankInfo?.averageScore);
  const peakAvg = Number(masterInfo?.averageScore);
  const masterScoreRaw = Number(masterInfo?.masterScore);
  const masterScore =
    Number.isFinite(masterScoreRaw) && masterScoreRaw > 0
      ? masterScoreRaw
      : 1200;

  const hasSeasonGames = Number.isFinite(seasonGames) && seasonGames > 0;
  const hasRatings =
    (Number.isFinite(rankAvg) && rankAvg > 0) ||
    (Number.isFinite(peakAvg) && peakAvg > 0) ||
    (Number.isFinite(masterScore) && masterScore > 0);
  if (!hasSeasonGames && !hasRatings) return null;

  return {
    seasonGames: hasSeasonGames ? seasonGames : undefined,
    seasonWins: hasSeasonGames
      ? Number.isFinite(seasonWins)
        ? seasonWins
        : 0
      : undefined,
    goldCount: Number(rankInfo?.goldCnt ?? 0) || undefined,
    /** 营地「个人评分」：排位场均评分 */
    rankScore:
      Number.isFinite(rankAvg) && rankAvg > 0
        ? Math.round(rankAvg)
        : undefined,
    /** 巅峰场均评分 */
    peakRating:
      Number.isFinite(peakAvg) && peakAvg > 0
        ? Math.round(peakAvg)
        : undefined,
    peakScore:
      Number.isFinite(masterScore) && masterScore > 0
        ? Math.round(masterScore)
        : undefined,
  };
}

function parseEquips(value: unknown): MatchEquip[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined;
  const equips: MatchEquip[] = [];
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const equipId = Number(row.equipId);
    const equipIcon = String(row.equipIcon || "");
    const equipName = String(row.equipName || "");
    if (!Number.isFinite(equipId) || !equipName) continue;
    equips.push({ equipId, equipIcon, equipName });
  }
  return equips.length ? equips : undefined;
}

type BattleDetailExtras = {
  equips?: MatchEquip[];
  economy?: number;
  economyPct?: number;
  /** 对英雄输出（totalHeroHurtCnt） */
  damage?: number;
  damagePct?: number;
  /** 承伤英雄伤害（totalBeheroHurtCnt） */
  takenDamage?: number;
  takenDamagePct?: number;
  /** 参团率（0–100） */
  joinPct?: number;
  /** 英雄战力（fightPower） */
  combatPower?: number;
};

function roundPct(part: number, total: number): number | undefined {
  if (!(total > 0) || !Number.isFinite(part)) return undefined;
  return Math.round((part / total) * 1000) / 10;
}

/** joinGamePercent 常见为 0–1 小数，偶发已是 0–100 */
function parseJoinPct(raw: unknown): number | undefined {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return undefined;
  const pct = n <= 1 ? n * 100 : n;
  return Math.round(pct * 10) / 10;
}

function findTargetRoleInDetail(
  detailPayload: Record<string, unknown>,
  targetRoleId: string,
): { role: Record<string, unknown>; roles: Record<string, unknown>[] } | null {
  const data = asRecord(detailPayload.data) || detailPayload;
  const roles = [...asList(data.blueRoles), ...asList(data.redRoles)];
  const wanted = String(targetRoleId || "");

  if (wanted) {
    for (const role of roles) {
      const basic = asRecord(role.basicInfo);
      if (basic && String(basic.roleId || "") === wanted) return { role, roles };
    }
  }

  // 兜底：详情 head 对应当前查看角色时，用其英雄匹配
  const head = asRecord(data.head);
  const headHeroId = head?.heroId != null ? String(head.heroId) : "";
  if (!headHeroId) return null;

  for (const role of roles) {
    const basic = asRecord(role.basicInfo);
    const records = asRecord(role.battleRecords);
    const usedHero = asRecord(records?.usedHero) || asRecord(basic?.usedHero);
    const heroId = String(
      records?.heroId ?? usedHero?.heroId ?? basic?.heroId ?? "",
    );
    if (heroId && heroId === headHeroId) return { role, roles };
  }
  return null;
}

/** 从对局详情中取出目标角色出装 / 经济 / 输出及本队占比 */
export function extractExtrasFromBattleDetail(
  detailPayload: Record<string, unknown>,
  targetRoleId: string,
): BattleDetailExtras {
  const found = findTargetRoleInDetail(detailPayload, targetRoleId);
  if (!found) return {};

  const { role, roles } = found;
  const records = asRecord(role.battleRecords);
  const stats = asRecord(role.battleStats);
  const basic = asRecord(role.basicInfo);
  const money = stats?.money != null ? Number(stats.money) : NaN;
  // 对英雄输出优先；缺失时再回退总输出
  const totalHurt =
    stats?.totalHeroHurtCnt != null
      ? Number(stats.totalHeroHurtCnt)
      : stats?.totalHurtCnt != null
        ? Number(stats.totalHurtCnt)
        : NaN;
  // 承伤英雄伤害优先；缺失时再回退总承伤
  const totalBehurt =
    stats?.totalBeheroHurtCnt != null
      ? Number(stats.totalBeheroHurtCnt)
      : stats?.totalBehurtCnt != null
        ? Number(stats.totalBehurtCnt)
        : NaN;
  const fightPower = stats?.fightPower != null ? Number(stats.fightPower) : NaN;

  const myCamp = basic?.acntCamp;
  let teamMoney = 0;
  let teamHurt = 0;
  let teamBehurt = 0;
  for (const r of roles) {
    const b = asRecord(r.basicInfo);
    if (myCamp != null && b?.acntCamp !== myCamp) continue;
    const s = asRecord(r.battleStats);
    teamMoney += Number(s?.money ?? 0) || 0;
    teamHurt += Number(s?.totalHeroHurtCnt ?? s?.totalHurtCnt ?? 0) || 0;
    teamBehurt += Number(s?.totalBeheroHurtCnt ?? s?.totalBehurtCnt ?? 0) || 0;
  }

  // 优先用队伍汇总 money（与营地展示一致）
  const data = asRecord(detailPayload.data) || detailPayload;
  const campNum = myCamp != null ? Number(myCamp) : NaN;
  const team =
    campNum === 1
      ? asRecord(data.blueTeam)
      : campNum === 2
        ? asRecord(data.redTeam)
        : null;
  const teamMoneyOfficial = team?.money != null ? Number(team.money) : NaN;
  if (Number.isFinite(teamMoneyOfficial) && teamMoneyOfficial > 0) {
    teamMoney = teamMoneyOfficial;
  }

  return {
    equips: parseEquips(records?.finalEquips),
    economy: Number.isFinite(money) ? money : undefined,
    economyPct: Number.isFinite(money) ? roundPct(money, teamMoney) : undefined,
    damage: Number.isFinite(totalHurt) ? totalHurt : undefined,
    damagePct: Number.isFinite(totalHurt) ? roundPct(totalHurt, teamHurt) : undefined,
    takenDamage: Number.isFinite(totalBehurt) ? totalBehurt : undefined,
    takenDamagePct: Number.isFinite(totalBehurt)
      ? roundPct(totalBehurt, teamBehurt)
      : undefined,
    joinPct: parseJoinPct(stats?.joinGamePercent),
    combatPower:
      Number.isFinite(fightPower) && fightPower > 0
        ? Math.round(fightPower)
        : undefined,
  };
}

export type EnrichBattleDetailOptions = {
  /** 每成功补全一场后回调（可用于立即写库） */
  onEnriched?: (
    match: NormalizedMatch,
    progress: { fetched: number; target: number },
  ) => void | Promise<void>;
};

/** 串行补全对局详情（出装 / 经济 / 伤害等），供后台第二阶段调用 */
export async function enrichMatchesWithBattleDetail(
  matches: NormalizedMatch[],
  targetRoleId: string,
  options?: EnrichBattleDetailOptions,
) {
  if (!matches.length || !targetRoleId) return;

  const delayMs = Math.max(
    0,
    Number(process.env.CAMP_BATTLE_DETAIL_DELAY_MS || "250") || 250,
  );
  const maxDetails = Math.max(
    0,
    Number(process.env.CAMP_BATTLE_DETAIL_MAX || String(CAMP_BATTLE_SYNC_MAX_MATCHES)) ||
      CAMP_BATTLE_SYNC_MAX_MATCHES,
  );
  const target = Math.min(matches.length, maxDetails);

  let fetched = 0;
  for (const match of matches) {
    if (fetched >= maxDetails) break;
    if (!match.rawJson) continue;

    let row: Record<string, unknown>;
    try {
      row = JSON.parse(match.rawJson) as Record<string, unknown>;
    } catch {
      continue;
    }

    const gameSeq = String(row.gameSeq || "");
    const gameSvr = String(row.gameSvrId || row.gameSvr || "");
    const relaySvr = String(row.relaySvrId || row.relaySvr || "");
    const battleType = Number(row.battleType);
    if (!gameSeq || !gameSvr || !relaySvr || !Number.isFinite(battleType)) continue;

    if (fetched > 0 && delayMs > 0) await sleep(delayMs);

    try {
      const detail = await getBattleDetail({
        gameSeq,
        gameSvr,
        relaySvr,
        battleType,
        targetRoleId,
      });
      const extras = extractExtrasFromBattleDetail(
        detail as Record<string, unknown>,
        targetRoleId,
      );
      if (extras.equips) match.equips = extras.equips;
      if (extras.economy != null) match.economy = extras.economy;
      if (extras.economyPct != null) match.economyPct = extras.economyPct;
      if (extras.damage != null) match.damage = extras.damage;
      if (extras.damagePct != null) match.damagePct = extras.damagePct;
      if (extras.takenDamage != null) match.takenDamage = extras.takenDamage;
      if (extras.takenDamagePct != null) match.takenDamagePct = extras.takenDamagePct;
      if (extras.joinPct != null) match.joinPct = extras.joinPct;
      if (extras.combatPower != null) match.combatPower = extras.combatPower;
      fetched += 1;
      if (options?.onEnriched) {
        await options.onEnriched(match, { fetched, target });
      }
    } catch (err) {
      if (
        err instanceof CampApiError &&
        (err.code === "auth" || err.code === "rate_limit" || err.code === "hidden")
      ) {
        // 登录失效 / 频控 / 未开放查询：停止继续拉详情
        throw err;
      }
      // 单场详情失败不阻断整次同步
    }
  }
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

  const mvpIcon =
    String(row.mvpUrlV3 || row.mvpUrlV2 || "").trim() || undefined;

  /** evaluateUrlV3 官方分路奖牌图（比 silver_/gold_ 文件名更准，可区分铜/银） */
  const EVALUATE_V3_MEDALS: Record<string, string> = {
    "116bb42c52b7d83b9d80ac9dd9580607": "银牌对抗路",
    e8602ae4b427f06dd1349438fbeab68f: "铜牌对抗路",
    c30089b8daf9a4792f85c8a6d97a3e9c: "金牌对抗路",
    a2c96893471637e5cf5c0a1e2c9829f3: "银牌中路",
    "977937945942799fd618773e5c378d3a": "银牌游走",
    "3159d2f1733203167a9a3d5d3e4656ad": "铜牌游走",
    c717aab51e99a4bfa9c6d2e024e97512: "金牌发育路",
    "7577421618c781e7a59b81904937a8a0": "银牌发育路",
    "1147db2cd2a46031783a9a0fc34f7f3c": "金牌游走",
    af6fd95b08fd1b58340b48374707262c: "铜牌发育路",
    "029706c958a71f2aa5c187e2ef021430": "铜牌中路",
    "39d8211165f3730700fc6db10abd170e": "银牌打野",
    f63de8a7f98863ab3a34aada6bc4bd6f: "金牌中路",
    "5142af35177e111837efbf85071f373b": "金牌打野",
    c8a09fe55b4614d0307a6161f32ae479: "铜牌打野",
    a8b5101bc81ae64cf96c67ed1ab21975: "顶级游走",
    "926ba0111984464ad46e72dc93157fcd": "顶级发育路",
    "5db4fef1bfc72dd2c5ae71b01ef3951b": "顶级对抗路",
  };

  const medalIcon = String(row.evaluateUrlV3 || "") || undefined;
  const v3Hash = medalIcon?.split("/").pop()?.replace(/\.png$/i, "") || "";
  let medal = (v3Hash && EVALUATE_V3_MEDALS[v3Hash]) || undefined;

  if (!medal) {
    const medalMatch = urlBlob.match(
      /\b(top|gold|silver|bronze)[-_](warrior|mage|assassin|support|shooter|archer|tank)\b/i,
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
      top: "顶级",
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
    mvpIcon,
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
      : undefined;
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
    mvpIcon: honors.mvpIcon,
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
  /** 拉一页战绩列表；-10107 等会映射为 hidden，表示未开放查询 */
  async assertBattleQueryAllowed(campId: string): Promise<void> {
    const userId = campId.includes(":") ? campId.split(":")[0] : campId.trim();
    if (!/^\d{5,15}$/.test(userId)) {
      throw new WzryApiError("营地 ID 无效", "invalid_id");
    }
    try {
      await getMoreBattleList(userId, { lastTime: 0 });
    } catch (err) {
      mapCampError(err);
    }
  }

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
    options?: {
      num?: number;
      nickname?: string;
      knownExternalIds?: string[];
      enrichDetails?: boolean;
    },
  ): Promise<FetchResult> {
    const userId = campId.includes(":") ? campId.split(":")[0] : campId.trim();
    if (!/^\d{5,15}$/.test(userId)) {
      throw new WzryApiError("营地 ID 无效", "invalid_id");
    }

    const knownIds = (options?.knownExternalIds || [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    const incremental = knownIds.length > 0;
    const enrichDetails = options?.enrichDetails !== false;

    try {
      const [profileRes, battlePages] = await Promise.all([
        getProfile(userId),
        fetchMoreBattleListPages(userId, {
          maxPages: CAMP_BATTLE_SYNC_MAX_PAGES,
          maxMatches: CAMP_BATTLE_SYNC_MAX_MATCHES,
          stopAtExternalIds: incremental ? knownIds : undefined,
        }),
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

      const battles = battlePages.list;
      const matches = await Promise.all(
        battles.map((row, idx) => mapBattleRow(row, userId, idx)),
      );
      const latestPeakScore = matches
        .filter((m) => m.mode === "peak" && m.peakScore != null && m.peakScore > 0)
        .sort((a, b) => b.playedAt.getTime() - a.playedAt.getTime())[0]?.peakScore;

      if (enrichDetails && roleId) {
        await enrichMatchesWithBattleDetail(matches, roleId);
      }

      // 增量时若无赛季页，不覆盖本地 mvp/金牌/赛季统计
      const mvpCount = incremental ? undefined : matches.filter((m) => m.mvp).length;
      const goldCount = incremental
        ? seasonStats?.goldCount
        : (seasonStats?.goldCount ?? matches.filter((m) => m.gold).length);

      return {
        profile: {
          campId: userId,
          gameNickname,
          gameAvatarUrl: avatar,
          currentRank: rankName || matches[0]?.rankName || "未知",
          currentStars: stars || matches[0]?.stars || 0,
          seasonGames: seasonStats?.seasonGames ?? (incremental ? undefined : matches.length),
          seasonWins:
            seasonStats?.seasonWins ??
            (incremental ? undefined : matches.filter((m) => m.result === "win").length),
          rankScore: seasonStats?.rankScore,
          peakRating: seasonStats?.peakRating,
          peakScore: latestPeakScore ?? 1200,
          mvpCount,
          goldCount,
          area: parseArea(areaText),
        },
        matches,
        roleId: roleId || undefined,
      };
    } catch (err) {
      mapCampError(err);
    }
  }
}
