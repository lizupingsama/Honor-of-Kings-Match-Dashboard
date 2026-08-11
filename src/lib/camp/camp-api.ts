import crypto from "node:crypto";
import { decrypt as xxteaDecrypt, encrypt as xxteaEncrypt } from "./xxtea";
import {
  listCampAuthAccounts,
  markCampAuthCooldown,
  pickAvailableCampAuth,
  type CampAuthAccount,
} from "./auth-store";
import { DEFAULT_PUBLIC_KEY } from "./wechat-login";

const MAIN_BASE = "https://kohcamp.qq.com";

type AuthDefaults = {
  gameAreaId: string;
  gameUserSex: string;
  kohDimGender: string;
  serverTimeOffsetMs: number;
  userAgent: string;
  xClientProto: string;
  contentEncrypt: string;
  acceptEncrypt: string;
  noEncrypt: string;
  isTrpcRequest: string;
  cChannelId: string;
  cClientVersionCode: string;
  cClientVersionName: string;
  cCurrentGameId: string;
  cGameId: string;
  cGzip: string;
  cIsArm64: string;
  cSupportArm64: string;
  cSystem: string;
  cSystemVersionCode: string;
  cSystemVersionName: string;
  cpuHardware: string;
  tinkerId: string;
  publicKey: string;
};

const DEFAULTS: AuthDefaults = {
  gameAreaId: "1",
  gameUserSex: "1",
  kohDimGender: "2",
  serverTimeOffsetMs: 0,
  userAgent: "okhttp/4.9.1",
  xClientProto: "https",
  contentEncrypt: "",
  acceptEncrypt: "",
  noEncrypt: "1",
  isTrpcRequest: "true",
  cChannelId: "10003391",
  cClientVersionCode: "2057957801",
  cClientVersionName: "10.111.0323",
  cCurrentGameId: "20001",
  cGameId: "20001",
  cGzip: "1",
  cIsArm64: "true",
  cSupportArm64: "true",
  cSystem: "android",
  cSystemVersionCode: "34",
  cSystemVersionName: "14",
  cpuHardware: "qcom",
  tinkerId: "2057957801_64_0",
  publicKey: DEFAULT_PUBLIC_KEY,
};

export class CampApiError extends Error {
  code: "auth" | "hidden" | "rate_limit" | "upstream" | "not_found";
  constructor(message: string, code: CampApiError["code"] = "upstream") {
    super(message);
    this.code = code;
  }
}

type ResolvedAuth = CampAuthAccount & AuthDefaults & { xLogUid: string };

function str(value: unknown, fallback = "") {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function buildPublicKeyPem(publicKey: string) {
  const chunks = publicKey.match(/.{1,64}/g) || [publicKey];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join("\n")}\n-----END PUBLIC KEY-----`;
}

function resolveAuth(account: CampAuthAccount): ResolvedAuth {
  return {
    ...DEFAULTS,
    ...account,
    xLogUid: account.xLogUid || crypto.randomUUID().toUpperCase(),
    publicKey: DEFAULTS.publicKey,
    gameAreaId: DEFAULTS.gameAreaId,
    gameUserSex: DEFAULTS.gameUserSex,
    kohDimGender: DEFAULTS.kohDimGender,
  };
}

function decodeEncodeRes(auth: ResolvedAuth) {
  if (!auth.encodeRes) return null;
  try {
    const decrypted = crypto.publicDecrypt(
      {
        key: buildPublicKeyPem(auth.publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(auth.encodeRes, "base64"),
    );
    return JSON.parse(decrypted.toString("utf8")) as { userKey?: string };
  } catch {
    return null;
  }
}

function resolveUserKey(auth: ResolvedAuth) {
  if (auth.userKey) return auth.userKey;
  return decodeEncodeRes(auth)?.userKey || "";
}

function getTimestamp(auth: ResolvedAuth) {
  return Date.now() + auth.serverTimeOffsetMs;
}

function buildNonce(prefix: string, timestamp: number) {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "")}:${timestamp}`;
}

function generateEncodeParam(auth: ResolvedAuth) {
  const userKey = resolveUserKey(auth);
  if (!userKey) return "";
  const timestamp = getTimestamp(auth);
  const payload = JSON.stringify({
    timestamp,
    nonce: buildNonce(`${auth.userId}:`, timestamp),
  });
  return xxteaEncrypt(Buffer.from(payload, "utf8"), Buffer.from(userKey, "utf8")).toString(
    "base64",
  );
}

function generateSpecialEncodeParam(auth: ResolvedAuth) {
  const timestamp = getTimestamp(auth);
  const payload = JSON.stringify({
    timestamp,
    nonce: buildNonce(":", timestamp),
  });
  return crypto
    .publicEncrypt(
      {
        key: buildPublicKeyPem(auth.publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(payload, "utf8"),
    )
    .toString("base64");
}

function buildTraceparent() {
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return `00-${traceId}-${spanId}-01`;
}

function getAuthHeaders(auth: ResolvedAuth): Record<string, string> {
  const headers: Record<string, string> = {
    Host: "kohcamp.qq.com",
    "Content-Type": "application/json; charset=UTF-8",
    "User-Agent": auth.userAgent,
    "Content-Encrypt": auth.contentEncrypt,
    "Accept-Encrypt": auth.acceptEncrypt,
    NOENCRYPT: auth.noEncrypt,
    "X-Client-Proto": auth.xClientProto,
    "x-log-uid": auth.xLogUid,
    traceparent: buildTraceparent(),
    istrpcrequest: auth.isTrpcRequest,
    cchannelid: auth.cChannelId,
    cclientversioncode: auth.cClientVersionCode,
    cclientversionname: auth.cClientVersionName,
    ccurrentgameid: auth.cCurrentGameId,
    cgameid: auth.cGameId,
    cgzip: auth.cGzip,
    cisarm64: auth.cIsArm64,
    crand: String(Date.now()),
    csupportarm64: auth.cSupportArm64,
    csystem: auth.cSystem,
    csystemversioncode: auth.cSystemVersionCode,
    csystemversionname: auth.cSystemVersionName,
    cpuhardware: auth.cpuHardware,
    gameareaid: auth.gameAreaId,
    gameid: auth.cGameId,
    gameusersex: auth.gameUserSex,
    tinkerid: auth.tinkerId,
    token: auth.token,
    userid: auth.userId,
    kohdimgender: auth.kohDimGender,
  };

  if (auth.openId) headers.openid = auth.openId;
  if (auth.gameOpenId) headers.gameopenid = auth.gameOpenId;
  if (auth.gameRoleId) headers.gameroleid = auth.gameRoleId;
  if (auth.gameServerId) headers.gameserverid = auth.gameServerId;

  const encodeParam = generateEncodeParam(auth);
  if (encodeParam) {
    headers.encodeParam = encodeParam;
  } else {
    headers.specialEncodeParam = generateSpecialEncodeParam(auth);
  }

  return headers;
}

function decryptCampResponse(text: string, auth: ResolvedAuth) {
  const userKey = resolveUserKey(auth);
  if (!userKey) {
    throw new CampApiError("接口响应已加密，但登录态缺少 userKey", "auth");
  }
  const decrypted = xxteaDecrypt(Buffer.from(text.trim(), "base64"), Buffer.from(userKey, "utf8"));
  return decrypted.toString("utf8").replace(/\0+$/g, "");
}

async function parseResponse(response: Response, auth: ResolvedAuth) {
  const encryptParamErr =
    response.headers.get("encryptparamerr") || response.headers.get("encryptParamErr");
  if (encryptParamErr) {
    throw new CampApiError(
      `营地安全参数校验失败 (${encryptParamErr})，请重新扫码登录`,
      "auth",
    );
  }

  const returnCode = response.headers.get("returncode") || response.headers.get("returnCode");
  const returnMsgRaw = response.headers.get("returnmsg") || response.headers.get("returnMsg") || "";
  let returnMsg = returnMsgRaw;
  try {
    returnMsg = decodeURIComponent(returnMsgRaw);
  } catch {
    // keep raw
  }

  const text = await response.text();
  const payloadText =
    response.headers.get("campencrypt") === "true" ? decryptCampResponse(text, auth) : text;

  if (!payloadText && returnCode) {
    return { returnCode: Number(returnCode) || returnCode, returnMsg };
  }

  try {
    return JSON.parse(payloadText) as Record<string, unknown>;
  } catch {
    throw new CampApiError("营地接口返回无法解析，请重新扫码登录", "auth");
  }
}

function isAuthFailure(data: Record<string, unknown>) {
  const msg = str(data.returnMsg || data.message || data.msg);
  return /登录|登录态|token|鉴权|安全参数|重新登录|权限/i.test(msg);
}

async function requestOnce(account: CampAuthAccount, endpoint: string, body: Record<string, unknown>) {
  const auth = resolveAuth(account);
  if (!auth.token || !auth.userId || (!auth.userKey && !auth.encodeRes)) {
    throw new CampApiError("营地登录态不完整，请到管理后台重新扫码登录", "auth");
  }

  const url = `${MAIN_BASE}${endpoint}`;
  const headers = getAuthHeaders(auth);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    const data = await parseResponse(response, auth);

    if (isAuthFailure(data)) {
      throw new CampApiError(
        str(data.returnMsg || data.message || data.msg) || "营地登录态已失效，请重新扫码登录",
        "auth",
      );
    }

    const code = Number(data.returnCode ?? 0);
    const message = str(data.returnMsg || data.message || data.msg);
    if (code === -10107) {
      throw new CampApiError("召唤师隐藏了个人战绩，请在王者营地开放战绩后重试", "hidden");
    }
    if (code === -30107 || message.includes("操作频繁") || message.includes("请求频繁")) {
      throw new CampApiError("操作频繁，请稍后重试", "rate_limit");
    }
    if (code !== 0 && code !== 200) {
      throw new CampApiError(
        message || `营地接口错误 (${code})`,
        "upstream",
      );
    }

    return data;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof CampApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new CampApiError("营地接口请求超时", "upstream");
    }
    throw new CampApiError(
      err instanceof Error ? err.message : "营地接口请求失败",
      "upstream",
    );
  }
}

/** 遇频控 / 登录失效时冷却当前账号并自动换号重试 */
async function request(endpoint: string, body: Record<string, unknown>) {
  const tried = new Set<string>();
  let lastError: CampApiError | null = null;

  while (true) {
    const account = pickAvailableCampAuth(tried);
    if (!account) break;

    tried.add(account.userId);
    try {
      return await requestOnce(account, endpoint, body);
    } catch (err) {
      if (!(err instanceof CampApiError)) throw err;
      lastError = err;
      if (err.code === "rate_limit" || err.code === "auth") {
        markCampAuthCooldown(account.userId, err.code);
        continue;
      }
      throw err;
    }
  }

  if (lastError) throw lastError;

  const total = listCampAuthAccounts().length;
  if (total > 0) {
    throw new CampApiError("营地账号均处于冷却或不可用，请稍后重试或添加新账号", "rate_limit");
  }
  throw new CampApiError("未找到营地登录态，请到管理后台扫码登录营地", "auth");
}

export async function getProfile(friendUserId: string) {
  return request("/game/koh/profile", {
    targetUserId: friendUserId,
    targetRoleId: "0",
    resVersion: "3",
    recommendPrivacy: "0",
    apiVersion: "2",
  });
}

export async function getMoreBattleList(
  friendUserId: string,
  options?: { lastTime?: number | string },
) {
  return request("/game/morebattlelist", {
    lastTime: options?.lastTime ?? 0,
    recommendPrivacy: 0,
    apiVersion: 5,
    friendUserId,
    option: 0,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 刷新固定：8 页、最多 100 条；不开放给玩家自行加拉 */
export const CAMP_BATTLE_SYNC_MAX_PAGES = 8;
export const CAMP_BATTLE_SYNC_MAX_MATCHES = 100;

/**
 * 翻页拉取 morebattlelist。
 * 官方接口不返回总页数，用 hasMore + lastTime 翻页。
 * - 全量：最多 8 页 / 100 条
 * - 增量：传入 stopAtExternalIds，从最新页往下拉，撞到已知对局即停
 */
export async function fetchMoreBattleListPages(
  friendUserId: string,
  options?: {
    maxPages?: number;
    maxMatches?: number;
    delayMs?: number;
    stopAtExternalIds?: Iterable<string>;
  },
) {
  const maxPages = Math.max(
    1,
    options?.maxPages ?? CAMP_BATTLE_SYNC_MAX_PAGES,
  );
  const delayMs = Math.max(
    0,
    options?.delayMs ??
      (Number(process.env.CAMP_BATTLE_PAGE_DELAY_MS || "400") || 400),
  );
  const maxMatches = Math.max(
    1,
    options?.maxMatches ?? CAMP_BATTLE_SYNC_MAX_MATCHES,
  );
  const stopAt = options?.stopAtExternalIds
    ? new Set(
        [...options.stopAtExternalIds]
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      )
    : null;
  const incremental = Boolean(stopAt && stopAt.size > 0);

  const list: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let lastTime: number | string = 0;
  let pagesFetched = 0;
  let hasMore = true;
  let stoppedAtKnown = false;

  while (hasMore && pagesFetched < maxPages) {
    if (pagesFetched > 0 && delayMs > 0) {
      await sleep(delayMs);
    }

    const res = await getMoreBattleList(friendUserId, { lastTime });
    const data =
      res && typeof res === "object" && "data" in res && res.data && typeof res.data === "object"
        ? (res.data as Record<string, unknown>)
        : (res as Record<string, unknown>);
    const pageList = Array.isArray(data.list)
      ? (data.list as Record<string, unknown>[])
      : Array.isArray(data.battle_list)
        ? (data.battle_list as Record<string, unknown>[])
        : [];

    for (const row of pageList) {
      const id = String(row.gameSeq || row.battleId || row.battle_id || "");
      const key =
        id ||
        [
          row.dtEventTime ?? row.dteventtime ?? "",
          row.heroId ?? "",
          row.killcnt ?? row.kills ?? "",
          row.deadcnt ?? row.deaths ?? "",
          row.assistcnt ?? row.assists ?? "",
        ].join("-");

      if (incremental && id && stopAt!.has(id)) {
        stoppedAtKnown = true;
        break;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(row);
      if (list.length >= maxMatches) break;
    }

    pagesFetched += 1;
    if (stoppedAtKnown || list.length >= maxMatches) {
      hasMore = false;
      break;
    }

    hasMore = Boolean(data.hasMore);
    const nextLast = data.lastTime;
    if (nextLast == null || nextLast === "" || nextLast === lastTime) {
      hasMore = false;
    } else {
      lastTime = nextLast as number | string;
    }
  }

  return {
    list,
    pagesFetched,
    hasMore,
    maxPages,
    incremental,
    stoppedAtKnown,
  };
}

export async function getSeasonpage(roleId: string) {
  return request("/game/seasonpage", {
    recommendPrivacy: 0,
    seasonId: 0,
    roleId,
  });
}

export type BattleDetailParams = {
  gameSeq: string;
  gameSvr: string;
  relaySvr: string;
  battleType: number;
  targetRoleId: string;
};

/** 单场对局详情（含十人面板、出装等） */
export async function getBattleDetail(params: BattleDetailParams) {
  return request("/game/battledetail", {
    recommendPrivacy: 0,
    battleType: params.battleType,
    gameSvr: params.gameSvr,
    relaySvr: params.relaySvr,
    targetRoleId: params.targetRoleId,
    gameSeq: params.gameSeq,
  });
}
