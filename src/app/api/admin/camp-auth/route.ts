import { requireAdmin } from "@/lib/admin-auth";
import { handleRouteError, jsonOk } from "@/lib/api";
import { clearCampAuth, getCampAuthStatus } from "@/lib/camp";

export async function GET() {
  try {
    await requireAdmin();
    return jsonOk(getCampAuthStatus());
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE() {
  try {
    await requireAdmin();
    clearCampAuth();
    return jsonOk({ loggedIn: false });
  } catch (err) {
    return handleRouteError(err);
  }
}
