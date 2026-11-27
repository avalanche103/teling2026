import { slugify } from "@/lib/slugify";
import type { SectionMap, SectionMapAction } from "./store";

/** SKS group «Измерительное оборудование для СКС» (not fiber optics / 282). */
export const NETWORK_TEST_PARENT_ID = 682;

/**
 * Public catalog slug for a new section (SSD style: latin + underscore).
 * Must never include supplier markers like "concept".
 */
export function sectionSlugFromTitle(title: string): string {
  const base = slugify(String(title || "").replace(/\+/g, " plus "));
  const underscored = base.replace(/-/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  return underscored || "section";
}

function isNetworkTestPriceSection(title: string): boolean {
  const t = title.toLowerCase();
  return (
    /\be1\b/.test(t) ||
    /adsl|vdsl/.test(t) ||
    /gigabit\s*ethernet|10g\s*ethernet|анализатор.*ethernet/.test(t) ||
    /радиочастот|афу|\brf\b/.test(t)
  );
}

/** Default catalog section for a KIWI price-list category title. */
export function defaultSectionIdForKiwiTitle(title: string): number | null {
  const t = title.toLowerCase();
  // Transceivers belong under active network (517), never under optical instruments (282).
  if (/\bsfp\b|\bsfp\+/.test(t) || /модули\s*sfp/.test(t)) return 517;
  if (/рефлектометр/.test(t)) return 489;
  if (/сварк/.test(t)) return 487;
  if (/скалыв|лезви/.test(t)) return 488;
  if (/инструмент.*монтаж|монтаж.*волс/.test(t)) return 485;
  if (/аксессуар|расходн/.test(t)) return 486;
  if (/тестер|измерительн.*оптич|оптическ.*измерит/.test(t)) return 490;
  if (/мощност/.test(t)) return 491;
  if (/источник/.test(t)) return 492;
  if (/микроскоп/.test(t)) return 496;
  if (/аттенюатор/.test(t)) return 494;
  if (/детектор|идентификатор|vfl|видимого/.test(t)) return 493;
  return null;
}

/** Refine leaf section from product name/articul when category is broad. */
export function refineSectionId(
  sectionTitle: string,
  articul: string,
  name: string,
  mappedSectionId: number | null,
): number | null {
  const blob = `${sectionTitle} ${articul} ${name}`.toLowerCase();

  // Copper / DSL / Ethernet / RF: never spill into optical tester leaves.
  if (/adsl|vdsl|kiwi-211/.test(blob)) return 676;
  if (/\be1\b|kiwi-1130/.test(blob)) return 675;
  if (/10g\s*ethernet|kiwi-3140/.test(blob)) return 678;
  if (/gigabit\s*ethernet|kiwi-3130/.test(blob)) return 677;
  if (/радиочастот|афу|kiwi-9100/.test(blob)) return 680;

  // If the price-list section itself is a network-test leaf, keep mapped section.
  if (isNetworkTestPriceSection(sectionTitle)) {
    return mappedSectionId;
  }

  if (/рефлектометр|otdr|kiwi-7[2-4]/.test(blob)) return 489;
  if (/сварк|kiwi-61|kiwi-64|kiwi-65|электрод/.test(blob)) return 487;
  if (/скалыв|лезви|kiwi-62|kiwi-63/.test(blob)) return 488;
  if (/микроскоп|fip|видеоскоп/.test(blob)) return 496;
  if (/аттенюатор/.test(blob)) return 494;
  if (/идентификатор|детектор.*волок|fid-|fls-241/.test(blob)) return 495;
  if (/vfl|видимого|kiwi-41|fsl/.test(blob)) return 493;
  if (/измеритель.*мощн|power.?meter|opm|px-?\d|kiwi-45\d0/.test(blob)) return 491;
  if (/источник.*излуч|light.?source|ols|kiwi-44\d0/.test(blob) && !/тестер/.test(blob)) {
    return 492;
  }
  if (/тестер|olts|kiwi-44|kiwi-45|max-9/.test(blob)) return 490;
  if (/\bsfp\+?|трансив|модул.*sfp/.test(blob)) return 517;
  if (/инструмент|стриппер|kit-std|kit-ftth|kit-cln/.test(blob)) return 485;
  return mappedSectionId;
}

export function defaultSectionIdForExfo(name: string, articul: string): number {
  const blob = `${name} ${articul}`.toLowerCase();
  if (/платформ|ftb-?\d|max-?tester|axs/.test(blob) && !/модул/.test(blob)) return 489;
  if (/модул|ftbx|ftb-\d{3,}/.test(blob) && /рефлект|otdr|720|730|735|740|750|760/.test(blob)) {
    return 489;
  }
  if (/рефлект|otdr|iolm|max-7|axs-1/.test(blob)) return 489;
  if (/тестер|olts|max-9|ftbx-94/.test(blob)) return 490;
  if (/измерител.*мощн|power.?meter|px[-\s]?\d/.test(blob)) return 491;
  if (/источник|ols|fls/.test(blob) && !/видимого|vfl/.test(blob)) return 492;
  if (/vfl|видимого|fsl|локатор/.test(blob)) return 493;
  if (/аттенюатор|voa/.test(blob)) return 494;
  if (/идентификатор|live.?fiber|fid|lfd/.test(blob)) return 495;
  if (/микроскоп|fip|connector|probe/.test(blob)) return 496;
  if (/модул/.test(blob)) return 489;
  return 489;
}

export function buildDefaultSectionMap(
  sections: Array<{ title: string; vendor: string }>,
): SectionMap {
  const map: SectionMap = {};
  for (const section of sections) {
    const existingId = defaultSectionIdForKiwiTitle(section.title);
    if (existingId != null) {
      map[section.title] = { action: "existing", sectionId: existingId };
      continue;
    }
    // Copper / Ethernet / RF analyzers — under «Измерительное оборудование для СКС» (682).
    map[section.title] = {
      action: "create",
      name: section.title,
      externalId: sectionSlugFromTitle(section.title),
      parentId: isNetworkTestPriceSection(section.title) ? NETWORK_TEST_PARENT_ID : 282,
      selectedFilters: ["brand", "price"],
    };
  }
  // Synthetic EXFO bucket title used by catalog sync.
  map["EXFO"] = { action: "existing", sectionId: 489 };
  return map;
}

export function mappingLabel(action: SectionMapAction): string {
  if (action.action === "skip") return "skip";
  if (action.action === "existing") return `existing:${action.sectionId}`;
  return `create:${action.externalId}`;
}
