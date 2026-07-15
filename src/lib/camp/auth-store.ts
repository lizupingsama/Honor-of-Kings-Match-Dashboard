import fs from "node:fs";
import path from "node:path";

export type CampAuthAccount = {
  userId: string;
  token: string;
  userKey: string;
  encodeRes: string;
  openId?: string;
  gameOpenId?: string;
  gameRoleId?: string;
  gameServerId?: string;
  accessToken?: string;
  refreshToken?: string;
  appOpenid?: string;
  avatar?: string;
  nickname?: string;
  snsnickname?: string;
  expires?: string;
  loginPlatform?: string;
  lastLoginAt?: string;
  xLogUid?: string;
};

export type CampAuthStatus = {
  loggedIn: boolean;
  userId?: string;
  nickname?: string;
  lastLoginAt?: string;
  expires?: string;
};

const AUTH_PATH = path.join(process.cwd(), "data", "camp-auth.json");

function maskId(value: string, keepStart = 3, keepEnd = 3) {
  if (!value) return "";
  if (value.length <= keepStart + keepEnd) return "***";
  return `${value.slice(0, keepStart)}***${value.slice(-keepEnd)}`;
}

export function isCampAuthReady(auth: CampAuthAccount | null | undefined): auth is CampAuthAccount {
  return Boolean(auth?.token && auth?.userId && (auth?.userKey || auth?.encodeRes));
}

export function readCampAuth(): CampAuthAccount | null {
  try {
    if (!fs.existsSync(AUTH_PATH)) return null;
    const raw = fs.readFileSync(AUTH_PATH, "utf8");
    const data = JSON.parse(raw) as CampAuthAccount;
    return isCampAuthReady(data) ? data : null;
  } catch {
    return null;
  }
}

export function writeCampAuth(account: CampAuthAccount) {
  const dir = path.dirname(AUTH_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(account, null, 2), "utf8");
}

export function clearCampAuth() {
  try {
    if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH);
  } catch {
    // ignore
  }
}

export function getCampAuthStatus(): CampAuthStatus {
  const auth = readCampAuth();
  if (!auth) return { loggedIn: false };
  return {
    loggedIn: true,
    userId: maskId(auth.userId),
    nickname: auth.nickname || auth.snsnickname || undefined,
    lastLoginAt: auth.lastLoginAt,
    expires: auth.expires || undefined,
  };
}

export function requireCampAuth(): CampAuthAccount {
  const auth = readCampAuth();
  if (!auth) {
    throw new Error("未找到营地登录态，请到管理后台扫码登录营地");
  }
  return auth;
}
