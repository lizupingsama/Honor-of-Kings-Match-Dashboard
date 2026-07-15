import crypto from "node:crypto";
import type { CampAuthAccount } from "./auth-store";

export const DEFAULT_PUBLIC_KEY =
  "MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC0h62mV/zjJtFsNdfFNlxksfUOpjDI2KCcBrPiA8T7szABT4InLDTrdXAW84QyGNiazB0i7pgPCNGSAYbiJrCRutZ5jQsVS0Wg/RnXfwVQDJcAHJDjP5IXyroeLX7NUxDai8nPcpfRsvq6sneobyPexZSH0TlVSnecsJZTj5wu/wIDAQAB";

const APPID_WX = "wxf4b1e8a3e9aaf978";
const CAMP_BASE_URL = "https://ssl.kohsocialapp.qq.com:10001";
const WX_QR_URL = "https://open.weixin.qq.com/connect/sdk/qrconnect";
const WX_POLL_URL = "https://long.open.weixin.qq.com/connect/l/qrconnect";

const COMMON_HEADERS: Record<string, string> = {
  "Content-Encrypt": "",
  "Accept-Encrypt": "",
  NOENCRYPT: "1",
  "X-Client-Proto": "https",
  "User-Agent": "okhttp/4.9.1",
};

export type WechatLoginSession = {
  taskId: string;
  xLogUid: string;
  uuid: string;
  qrcodeBase64: string;
  createdAt: string;
  expiresAt: string;
};

export type QrPollResult =
  | { status: "waiting"; statusCode: number | null }
  | { status: "scanned"; statusCode: number | null }
  | { status: "success"; account: CampAuthAccount }
  | { status: "expired" }
  | { status: "canceled" }
  | { status: "error"; message: string };

const sessions = new Map<string, WechatLoginSession>();

function buildUuid() {
  return crypto.randomUUID().toUpperCase();
}

function buildPublicKeyPem(publicKey: string) {
  const chunks = publicKey.match(/.{1,64}/g) || [publicKey];
  return `-----BEGIN PUBLIC KEY-----\n${chunks.join("\n")}\n-----END PUBLIC KEY-----`;
}

function rsaEncryptChunked(buffer: Buffer, publicKey: string) {
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += 117) {
    const chunk = buffer.subarray(offset, offset + 117);
    chunks.push(
      crypto.publicEncrypt(
        {
          key: buildPublicKeyPem(publicKey),
          padding: crypto.constants.RSA_PKCS1_PADDING,
        },
        chunk,
      ),
    );
  }
  return Buffer.concat(chunks);
}

function buildNonce(length = 8) {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
}

function sha1(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function decodeEncodeRes(encodeRes: string, publicKey = DEFAULT_PUBLIC_KEY) {
  if (!encodeRes) return null;
  try {
    const decrypted = crypto.publicDecrypt(
      {
        key: buildPublicKeyPem(publicKey),
        padding: crypto.constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(encodeRes, "base64"),
    );
    return JSON.parse(decrypted.toString("utf8")) as { userKey?: string };
  } catch {
    return null;
  }
}

function buildSpecialEncodeParam(publicKey = DEFAULT_PUBLIC_KEY) {
  const timestamp = Date.now();
  const nonce = `:${crypto.randomUUID().replace(/-/g, "")}:${timestamp}`;
  const deviceId = crypto.randomUUID().replace(/-/g, "");
  const payload = {
    timestamp,
    nonce,
    cDeviceId: deviceId,
    deviceid: deviceId,
    cDeviceImei: deviceId.slice(0, 15),
    cDeviceMac: "02:00:00:00:00:00",
    cDevicePPI: 480,
    cDeviceScreenWidth: 1080,
    cDeviceScreenHeight: 2400,
    cDeviceBrand: "OnePlus",
    cDeviceModel: "PHK110",
    cDeviceMem: 12 * 1024 * 1024 * 1024,
    cDeviceCPU: "SM8650",
    cSystemVersionCode: "34",
    cDeviceNet: "WIFI",
    cDeviceSP: "China Mobile",
    cDeviceOaid: deviceId,
    deviceLevel: 3,
    px: 0,
    py: 0,
    wifi_ssid: "unknown",
    wifi_mac: "02:00:00:00:00:00",
  };

  return rsaEncryptChunked(Buffer.from(JSON.stringify(payload), "utf8"), publicKey).toString(
    "base64",
  );
}

async function requestJson(
  url: string,
  options?: { method?: string; headers?: Record<string, string>; body?: string | null },
) {
  const response = await fetch(url, {
    method: options?.method || "GET",
    headers: options?.headers,
    body: options?.body ?? undefined,
    cache: "no-store",
  });
  const text = await response.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json, text };
}

async function fetchWxSdkTicket(xLogUid: string) {
  const result = await requestJson(`${CAMP_BASE_URL}/a/getwxsdkticket`, {
    method: "POST",
    headers: { ...COMMON_HEADERS, "x-log-uid": xLogUid },
  });
  const data = result.json?.data as { sdkTicket?: string } | undefined;
  if (!result.ok || result.json?.returnCode !== 0 || !data?.sdkTicket) {
    throw new Error(`获取登录 SDK Ticket 失败: ${result.text}`);
  }
  return data.sdkTicket;
}

async function fetchWechatQrCode(ticket: string) {
  const nonce = buildNonce();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sha1(
    `appid=${APPID_WX}&noncestr=${nonce}&sdk_ticket=${ticket}&timestamp=${timestamp}`,
  );
  const url = new URL(WX_QR_URL);
  url.searchParams.set("appid", APPID_WX);
  url.searchParams.set("noncestr", nonce);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("scope", "snsapi_userinfo");
  url.searchParams.set("signature", signature);

  const result = await requestJson(url.toString());
  const qrcode = (result.json?.qrcode as { qrcodebase64?: string } | undefined)?.qrcodebase64;
  const uuid = result.json?.uuid as string | undefined;

  if (!result.ok || result.json?.errcode !== 0 || !qrcode || !uuid) {
    throw new Error(`获取登录二维码失败: ${result.text}`);
  }

  return { uuid, qrcodeBase64: qrcode };
}

async function pollWechatQr(uuid: string) {
  const url = new URL(WX_POLL_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("uuid", uuid);
  return requestJson(url.toString());
}

async function loginWithWechatAuthCode(
  code: string,
  xLogUid: string,
  publicKey = DEFAULT_PUBLIC_KEY,
) {
  const specialEncodeParam = buildSpecialEncodeParam(publicKey);
  const form = new URLSearchParams({
    loginType: "wx",
    code,
    delOldUser: "0",
    key1: crypto.randomUUID().replace(/-/g, ""),
    lastLoginTime: "0",
    lastGetRemarkTime: "0",
    cChannelId: "10003391",
    cClientVersionCode: "2057957801",
    cClientVersionName: "10.111.0323",
    cCurrentGameId: "20001",
    cGameId: "20001",
    cGzip: "1",
    cIsArm64: "true",
    cRand: String(Date.now()),
    cSupportArm64: "true",
    cSystem: "android",
    cSystemVersionCode: "34",
    cSystemVersionName: "14",
    cpuHardware: "qcom",
    gameId: "20001",
    tinkerId: "2057957801_64_0",
    specialEncodeParam,
  });

  const result = await requestJson(`${CAMP_BASE_URL}/user/login`, {
    method: "POST",
    headers: {
      ...COMMON_HEADERS,
      "x-log-uid": xLogUid,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      cChannelId: "10003391",
      cClientVersionCode: "2057957801",
      cClientVersionName: "10.111.0323",
      cCurrentGameId: "20001",
      cGameId: "20001",
      cGzip: "1",
      cIsArm64: "true",
      cRand: String(Date.now()),
      cSupportArm64: "true",
      cSystem: "android",
      cSystemVersionCode: "34",
      cSystemVersionName: "14",
      cpuHardware: "qcom",
      gameId: "20001",
      tinkerId: "2057957801_64_0",
      specialEncodeParam,
    },
    body: form.toString(),
  });

  const data = result.json?.data as Record<string, unknown> | undefined;
  if (!result.ok || result.json?.returnCode !== 0 || !data?.userId || !data?.token) {
    throw new Error(`营地登录失败: ${result.text}`);
  }
  return result.json as { data: Record<string, unknown> };
}

function buildAccountFromLoginResponse(
  loginResponse: { data: Record<string, unknown> },
  xLogUid: string,
  publicKey = DEFAULT_PUBLIC_KEY,
): CampAuthAccount {
  const data = loginResponse.data || {};
  const encodeRes = String(data.encodeRes || "");
  const encodePayload = decodeEncodeRes(encodeRes, publicKey);

  return {
    userId: String(data.userId || ""),
    token: String(data.token || ""),
    userKey: String(encodePayload?.userKey || ""),
    encodeRes,
    accessToken: String(data.accessToken || ""),
    refreshToken: String(data.refreshToken || ""),
    appOpenid: String(data.appOpenid || ""),
    openId: String(data.openId || data.appOpenid || ""),
    avatar: String(data.avatar || ""),
    nickname: String(data.nickname || ""),
    snsnickname: String(data.snsnickname || ""),
    expires: String(data.expires || ""),
    loginPlatform: "wechat",
    lastLoginAt: new Date().toISOString(),
    xLogUid,
  };
}

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (new Date(session.expiresAt).getTime() < now) {
      sessions.delete(id);
    }
  }
}

export async function createWechatLoginSession(): Promise<WechatLoginSession> {
  pruneExpiredSessions();
  const xLogUid = buildUuid();
  const sdkTicket = await fetchWxSdkTicket(xLogUid);
  const qrData = await fetchWechatQrCode(sdkTicket);
  const taskId = crypto.randomUUID();
  const session: WechatLoginSession = {
    taskId,
    xLogUid,
    uuid: qrData.uuid,
    qrcodeBase64: qrData.qrcodeBase64,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
  };
  sessions.set(taskId, session);
  return session;
}

export function getWechatLoginSession(taskId: string): WechatLoginSession | null {
  pruneExpiredSessions();
  return sessions.get(taskId) || null;
}

export function removeWechatLoginSession(taskId: string) {
  sessions.delete(taskId);
}

/** 单次轮询（供 API 调用），成功时返回账号并移除会话 */
export async function pollWechatLoginOnce(taskId: string): Promise<QrPollResult> {
  const session = getWechatLoginSession(taskId);
  if (!session) {
    return { status: "expired" };
  }
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    sessions.delete(taskId);
    return { status: "expired" };
  }

  try {
    const pollResult = await pollWechatQr(session.uuid);
    const statusCode =
      (pollResult.json?.wx_errcode as number | undefined) ??
      (pollResult.json?.errcode as number | undefined) ??
      null;
    const authCode =
      (pollResult.json?.wx_code as string | undefined) ??
      (pollResult.json?.code as string | undefined) ??
      null;

    if (authCode && statusCode === 405) {
      const loginResponse = await loginWithWechatAuthCode(authCode, session.xLogUid);
      const account = buildAccountFromLoginResponse(loginResponse, session.xLogUid);
      sessions.delete(taskId);
      return { status: "success", account };
    }

    if (statusCode === 402) {
      sessions.delete(taskId);
      return { status: "expired" };
    }
    if (statusCode === 403) {
      sessions.delete(taskId);
      return { status: "canceled" };
    }
    if (statusCode === 500) {
      return { status: "error", message: "登录服务异常，请稍后再试" };
    }
    // 404 = 已扫码未确认
    if (statusCode === 404) {
      return { status: "scanned", statusCode };
    }
    return { status: "waiting", statusCode };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "轮询登录状态失败",
    };
  }
}
