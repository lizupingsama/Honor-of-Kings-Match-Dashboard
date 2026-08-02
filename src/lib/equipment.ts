import type { MatchEquip } from "./wzry-api";

export type EquipmentCategory = "physical" | "magic" | "defense" | "other";
export type EquipmentBoardCategory = "all" | "physical" | "magic" | "defense";

export type FinalEquipmentMeta = {
  category: EquipmentCategory;
  label: string;
};

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  physical: "物攻装",
  magic: "法装",
  defense: "防装",
  other: "其他",
};

const PHYSICAL_EQUIP_NAMES = new Set([
  "暗影战斧",
  "影刃",
  "寒霜袭侵",
  "闪电匕首",
  "强者破军",
  "破军",
  "末世",
  "碎星锤",
  "名刀·司命",
  "宗师之力",
  "无尽战刃",
  "逐风",
  "破魔刀",
  "仁者破晓",
  "破晓",
  "逐日之弓",
  "制裁之刃",
  "泣血之刃",
  "纯净苍穹",
  "不动·天穹",
  "天穹",
]);

const MAGIC_EQUIP_NAMES = new Set([
  "噬神之书",
  "博学者之怒",
  "巫术法杖",
  "符文大剑",
  "虚无法杖",
  "破茧之衣",
  "贤者天书",
  "贤者之书",
  "梦魇之牙",
  "回响之杖",
  "日暮之流",
  "金色圣剑",
  "时之预言",
  "辉月",
  "炽热支配",
  "痛苦面具",
  "凝冰之息",
  "圣杯",
]);

const DEFENSE_EQUIP_NAMES = new Set([
  "冰痕之握",
  "魔女斗篷",
  "血魔之怒",
  "极寒风暴",
  "反伤刺甲",
  "冰霜冲击",
  "贤者的庇护",
  "霸者重装",
  "不死鸟之眼",
  "永夜守护",
  "红莲斗篷",
  "不祥征兆",
  "徐行·凛冬",
  "暴烈之甲",
  "旭日初光",
]);

const OTHER_FINAL_EQUIP_NAMES = new Set([
  "抵抗之靴",
  "影忍之足",
  "秘法之靴",
  "急速战靴",
  "冷静之靴",
  "疾步之靴",
  "贪婪之噬",
  "怒龙剑盾",
  "巨人之握",
  "极影",
  "近卫荣耀",
  "救赎之翼",
  "奔狼纹章",
  "形昭之鉴",
  "星泉",
  "极影·形昭",
  "无象神器",
]);

export function getEquipmentCategoryLabel(category: EquipmentCategory) {
  return CATEGORY_LABELS[category];
}

export function getFinalEquipmentMeta(equip: Pick<MatchEquip, "equipName">): FinalEquipmentMeta | null {
  const name = equip.equipName.trim();
  if (!name) return null;
  if (PHYSICAL_EQUIP_NAMES.has(name)) {
    return { category: "physical", label: CATEGORY_LABELS.physical };
  }
  if (MAGIC_EQUIP_NAMES.has(name)) {
    return { category: "magic", label: CATEGORY_LABELS.magic };
  }
  if (DEFENSE_EQUIP_NAMES.has(name)) {
    return { category: "defense", label: CATEGORY_LABELS.defense };
  }
  if (OTHER_FINAL_EQUIP_NAMES.has(name)) {
    return { category: "other", label: CATEGORY_LABELS.other };
  }
  return null;
}

export function isEquipmentBoardCategory(
  value: string,
): value is EquipmentBoardCategory {
  return value === "all" || value === "physical" || value === "magic" || value === "defense";
}
