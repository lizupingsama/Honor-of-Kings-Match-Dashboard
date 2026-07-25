import { z } from "zod";
import {
  clearAdminCookie,
  createAdminToken,
  getAdminPassword,
  isAdminAuthenticated,
  setAdminCookie,
} from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
};

const loginSchema = z.object({
  password: z.string().min(1, "请输入密码"),
});

export async function GET() {
  try {
    const ok = await isAdminAuthenticated();
    return jsonOk({ authenticated: ok }, { headers: NO_STORE_HEADERS });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(req: Request) {
  try {
    const body = loginSchema.parse(await req.json());
    if (body.password !== getAdminPassword()) {
      return jsonError("密码错误", 401);
    }
    const token = await createAdminToken();
    const res = NextResponse.json(
      { ok: true, data: { authenticated: true } },
      { headers: NO_STORE_HEADERS },
    );
    setAdminCookie(res, token);
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  try {
    const res = NextResponse.json(
      { ok: true, data: { authenticated: false } },
      { headers: NO_STORE_HEADERS },
    );
    clearAdminCookie(res);
    return res;
  } catch (err) {
    return handleRouteError(err);
  }
}
