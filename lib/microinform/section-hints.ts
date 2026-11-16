import type { SectionMapAction } from "./store";
import { SWITCH_SELECTED_FILTERS } from "./switch-chars";

export type CatalogGroup =
  | "switches"
  | "media_converters"
  | "modules"
  | "wireless"
  | "skip";

export function classifyPriceSection(title: string, vendor: string): CatalogGroup {
  const t = title.toLowerCase();
  const v = vendor.toLowerCase();
  if (!(v.includes("d-link") || v.includes("origo"))) return "skip";

  if (t.includes("медиаконверт")) return "media_converters";
  if (t.includes("модул") && t.includes("кабел")) return "modules";
  if (t.includes("модул") && (t.includes("sfp") || t.includes("origo") || t.includes("d-link"))) {
    return "modules";
  }
  if (t.includes("коммутатор")) return "switches";
  if (t.includes("беспровод")) return "wireless";
  if (t.includes("wifi") || t.includes("wi-fi") || t.includes("access point")) return "wireless";

  return "skip";
}

export function defaultActionForSection(
  title: string,
  vendor: string,
): SectionMapAction {
  const group = classifyPriceSection(title, vendor);
  switch (group) {
    case "media_converters":
      return { action: "existing", sectionId: 518 };
    case "modules":
      return { action: "existing", sectionId: 517 };
    case "switches":
      return {
        action: "create",
        name: "Коммутаторы",
        externalId: "kommutatory",
        parentId: 293,
        selectedFilters: [...SWITCH_SELECTED_FILTERS],
      };
    case "wireless":
      return {
        action: "create",
        name: "Беспроводное оборудование",
        externalId: "besprovodnoe-oborudovanie",
        parentId: 293,
        selectedFilters: ["brand", "price"],
      };
    default:
      return { action: "skip" };
  }
}

export function buildDefaultSectionMap(
  sections: Array<{ title: string; vendor: string }>,
): Record<string, SectionMapAction> {
  const map: Record<string, SectionMapAction> = {};
  for (const section of sections) {
    map[section.title] = defaultActionForSection(section.title, section.vendor);
  }
  return map;
}
