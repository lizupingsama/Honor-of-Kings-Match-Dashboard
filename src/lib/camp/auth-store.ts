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
  /** ISO：频控冷却截止时间 */
  cooledUntil?: string;
  /** 最近一次导致跳过该号的原因 */
  lastSkipReason?: "rate_limit" | "auth";
};

export type CampAuthAccountStatus = {
  userId: string;
  nickname?: string;
  lastLoginAt?: string;
  expires?: string;
  available: boolean;
  cooledUntil?: string;
  lastSkipReason?: "rate_limit" | "auth";
};

export type CampAuthStatus = {
  loggedIn: boolean;
  count: number;
  availableCount: number;
  userId?: string;
  nickname?: string;
  lastLoginAt?: string;
  expires?: string;
  accounts: CampAuthAccountStatus[];
};

type CampAuthFile = {
  accounts: CampAuthAccount[];
};

const AUTH_PATH = path.join(process.cwd(), "data", "camp-auth.json");

/** 频控后账号冷却时长，默认 5 分钟 */
function cooldownMs() {
  const n = Number(process.env.CAMP_ACCOUNT_COOLDOWN_MS || "300000");
  return Number.isFinite(n) && n >= 0 ? n : 300_000;
}

function maskId(value: string, keepStart = 3, keepEnd = 3) {
  if (!value) return "";
  if (value.length <= keepStart + keepEnd) return "***";
  return `${value.slice(0, keepStart)}***${value.slice(-keepEnd)}`;
}

export function isCampAuthReady(auth: CampAuthAccount | null | undefined): auth is CampAuthAccount {
  return Boolean(auth?.token && auth?.userId && (auth?.userKey || auth?.encodeRes));
}

function isCooled(account: CampAuthAccount, now = Date.now()) {
  if (!account.cooledUntil) return false;
  const until = Date.parse(account.cooledUntil);
  return Number.isFinite(until) && until > now;
}

function isAccountAvailable(account: CampAuthAccount, now = Date.now()) {
  return isCampAuthReady(account) && !isCooled(account, now);
}

function toStatusRow(account: CampAuthAccount, now = Date.now()): CampAuthAccountStatus {
  // 管理后台需要真实 userId 以便删除/切换；勿脱敏
  return {
    userId: account.userId,
    nickname: account.nickname || account.snsnickname || undefined,
    lastLoginAt: account.lastLoginAt,
    expires: account.expires || undefined,
    available: isAccountAvailable(account, now),
    cooledUntil: isCooled(account, now) ? account.cooledUntil : undefined,
    lastSkipReason: account.lastSkipReason,
  };
}

function normalizeFile(raw: unknown): CampAuthFile {
  if (!raw || typeof raw !== "object") return { accounts: [] };

  const obj = raw as Record<string, unknown>;

  // 新格式：{ accounts: [...] }
  if (Array.isArray(obj.accounts)) {
    return {
      accounts: obj.accounts.filter((item): item is CampAuthAccount =>
        isCampAuthReady(item as CampAuthAccount),
      ),
    };
  }

  // 旧格式：单个账号对象
  if (isCampAuthReady(obj as unknown as CampAuthAccount)) {
    return { accounts: [obj as unknown as CampAuthAccount] };
  }

  return { accounts: [] };
}

function readAuthFile(): CampAuthFile {
  try {
    if (!fs.existsSync(AUTH_PATH)) return { accounts: [] };
    const raw = fs.readFileSync(AUTH_PATH, "utf8");
    return normalizeFile(JSON.parse(raw));
  } catch {
    return { accounts: [] };
  }
}

function writeAuthFile(file: CampAuthFile) {
  const dir = path.dirname(AUTH_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(AUTH_PATH, JSON.stringify(file, null, 2), "utf8");
}

/** 兼容旧调用：返回第一个可用账号，否则第一个账号 */
export function readCampAuth(): CampAuthAccount | null {
  const { accounts } = readAuthFile();
  if (accounts.length === 0) return null;
  return pickAvailableCampAuth() || accounts[0] || null;
}

export function listCampAuthAccounts(): CampAuthAccount[] {
  return readAuthFile().accounts;
}

/** 扫码登录：按 userId upsert，不覆盖其它账号 */
export function writeCampAuth(account: CampAuthAccount) {
  if (!isCampAuthReady(account)) {
    throw new Error("营地登录态不完整，无法保存");
  }
  const file = readAuthFile();
  const next: CampAuthAccount = {
    ...account,
    cooledUntil: undefined,
    lastSkipReason: undefined,
  };
  const idx = file.accounts.findIndex((a) => a.userId === account.userId);
  if (idx >= 0) {
    file.accounts[idx] = { ...file.accounts[idx], ...next };
  } else {
    file.accounts.push(next);
  }
  writeAuthFile(file);
}

export function removeCampAuth(userId: string) {
  const id = userId.trim();
  if (!id) return false;
  const file = readAuthFile();
  const before = file.accounts.length;
  file.accounts = file.accounts.filter((a) => a.userId !== id);
  if (file.accounts.length === before) return false;
  if (file.accounts.length === 0) {
    clearCampAuth();
  } else {
    writeAuthFile(file);
  }
  return true;
}

export function clearCampAuth() {
  try {
    if (fs.existsSync(AUTH_PATH)) fs.unlinkSync(AUTH_PATH);
  } catch {
    // ignore
  }
}

export function pickAvailableCampAuth(excludeUserIds: Iterable<string> = []): CampAuthAccount | null {
  const exclude = new Set([...excludeUserIds].map(String).filter(Boolean));
  const now = Date.now();
  const { accounts } = readAuthFile();
  for (const account of accounts) {
    if (exclude.has(account.userId)) continue;
    if (isAccountAvailable(account, now)) return account;
  }
  return null;
}

export function markCampAuthCooldown(
  userId: string,
  reason: "rate_limit" | "auth",
  durationMs?: number,
) {
  const file = readAuthFile();
  const idx = file.accounts.findIndex((a) => a.userId === userId);
  if (idx < 0) return;

  const ms = durationMs ?? (reason === "auth" ? cooldownMs() * 2 : cooldownMs());
  const cooledUntil = new Date(Date.now() + ms).toISOString();
  file.accounts[idx] = {
    ...file.accounts[idx],
    cooledUntil,
    lastSkipReason: reason,
  };
  writeAuthFile(file);
}

export function getCampAuthStatus(): CampAuthStatus {
  const now = Date.now();
  const accounts = readAuthFile().accounts;
  const rows = accounts.map((a) => toStatusRow(a, now));
  const available = accounts.filter((a) => isAccountAvailable(a, now));
  const primary = available[0] || accounts[0];

  if (!primary) {
    return { loggedIn: false, count: 0, availableCount: 0, accounts: [] };
  }

  return {
    loggedIn: available.length > 0,
    count: accounts.length,
    availableCount: available.length,
    userId: maskId(primary.userId),
    nickname: primary.nickname || primary.snsnickname || undefined,
    lastLoginAt: primary.lastLoginAt,
    expires: primary.expires || undefined,
    accounts: rows,
  };
}

export function requireCampAuth(): CampAuthAccount {
  const auth = pickAvailableCampAuth();
  if (!auth) {
    const total = listCampAuthAccounts().length;
    if (total > 0) {
      throw new Error("营地账号均处于冷却或不可用，请稍后重试或添加新账号");
    }
    throw new Error("未找到营地登录态，请到管理后台扫码登录营地");
  }
  return auth;
}
