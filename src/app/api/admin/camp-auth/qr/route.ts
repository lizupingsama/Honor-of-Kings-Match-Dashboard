import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import {
  createWechatLoginSession,
  getCampAuthStatus,
  pollWechatLoginOnce,
  writeCampAuth,
} from "@/lib/camp";

/** POST: 发起微信扫码登录，返回二维码 */
export async function POST() {
  try {
    await requireAdmin();
    const session = await createWechatLoginSession();
    return jsonOk({
      taskId: session.taskId,
      qrcodeBase64: session.qrcodeBase64,
      expiresAt: session.expiresAt,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

/** GET: 轮询扫码状态 ?taskId= */
export async function GET(req: Request) {
  try {
    await requireAdmin();
    const taskId = new URL(req.url).searchParams.get("taskId")?.trim();
    if (!taskId) {
      return jsonError("缺少 taskId", 400);
    }

    const result = await pollWechatLoginOnce(taskId);

    if (result.status === "success") {
      writeCampAuth(result.account);
      return jsonOk({
        status: "success" as const,
        auth: getCampAuthStatus(),
      });
    }

    return jsonOk({
      status: result.status,
      statusCode: "statusCode" in result ? result.statusCode : undefined,
      message: "message" in result ? result.message : undefined,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
