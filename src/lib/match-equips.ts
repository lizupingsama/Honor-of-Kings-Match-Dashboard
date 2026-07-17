import type { MatchEquip } from "./wzry-api";

export function parseEquipsJson(raw: string | null | undefined): MatchEquip[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Record<string, unknown>;
        const equipId = Number(row.equipId);
        const equipIcon = String(row.equipIcon || "");
        const equipName = String(row.equipName || "");
        if (!Number.isFinite(equipId) || !equipName) return null;
        return { equipId, equipIcon, equipName } satisfies MatchEquip;
      })
      .filter((x): x is MatchEquip => x != null);
  } catch {
    return [];
  }
}
