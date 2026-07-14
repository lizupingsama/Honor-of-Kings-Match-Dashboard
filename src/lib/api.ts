import { NextResponse } from "next/server";
import { HeroPowerApiError } from "./hero-power-api";
import { PlayerServiceError } from "./player-service";
import { ZodError } from "zod";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export function handleRouteError(err: unknown) {
  if (err instanceof PlayerServiceError) {
    return jsonError(
      err.message,
      err.status,
      err.retryAfter ? { retryAfter: err.retryAfter } : undefined,
    );
  }
  if (err instanceof HeroPowerApiError) {
    return jsonError(err.message, err.status);
  }
  if (err instanceof ZodError) {
    return jsonError(err.issues[0]?.message || "参数错误", 400);
  }
  if (err instanceof Error && "status" in err && typeof (err as { status: unknown }).status === "number") {
    return jsonError(err.message, (err as { status: number }).status);
  }
  console.error(err);
  return jsonError("服务器错误", 500);
}
