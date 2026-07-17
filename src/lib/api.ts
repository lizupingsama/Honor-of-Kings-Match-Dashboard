import { Prisma } from "@prisma/client";
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

function isSchemaDriftError(err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === "P2021" || err.code === "P2022";
  }
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return (
    msg.includes("does not exist in the current database") ||
    msg.includes("no such column") ||
    msg.includes("no such table")
  );
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
  if (isSchemaDriftError(err)) {
    return jsonError("数据库结构未同步，请在服务器执行 npm run db:push 后重启", 500);
  }
  return jsonError("服务器错误", 500);
}
