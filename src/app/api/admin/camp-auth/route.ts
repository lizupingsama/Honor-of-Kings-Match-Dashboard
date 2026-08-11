import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonError, jsonOk } from "@/lib/api";
import { clearCampAuth, getCampAuthStatus, removeCampAuth } from "@/lib/camp";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(getCampAuthStatus());
  } catch (err) {
    return handleRouteError(err);
  }
}

/** DELETE: 清除全部；带 ?userId= 则只删该账号 */
export async function DELETE(req: Request) {
  try {
    await requireAdmin();
    const userId = new URL(req.url).searchParams.get("userId")?.trim();
    if (!userId) {
      clearCampAuth();
      return jsonOk(getCampAuthStatus());
    }

    if (!removeCampAuth(userId)) {
      return jsonError("未找到该营地账号", 404);
    }
    return jsonOk(getCampAuthStatus());
  } catch (err) {
    return handleRouteError(err);
  }
}
