import type { SectionMapAction } from "./store";
import { SWITCH_SELECTED_FILTERS } from "./switch-chars";

export type CatalogGroup =
  | "switches"
  | "routers"
  | "wireless"
  | "media_converters"
  | "modules"
  | "kvm"
  | "kvm_consoles"
  | "kvm_extenders"
  | "kvm_cables"
  | "kvm_modules"
  | "adapters"
  | "usb"
  | "cameras"
  | "xdsl"
  | "voip"
  | "software"
  | "power_supplies"
  | "poe"
  | "gpon"
  | "av_extenders"
  | "av_matrix"
  | "av_switches"
  | "av_splitters"
  | "av_converters"
  | "av_cables"
  | "mixed"
  | "skip";

const BASIC_FILTERS = ["brand", "price"] as const;

/** Stable section ids under Microinform catalog tree. */
export const CATALOG_SECTION_IDS = {
  switches: 633,
  routers: 634,
  wireless: 632,
  cameras: 635,
  xdsl: 636,
  voip: 637,
  media_converters: 518,
  modules: 517,
  poe: 638,
  power_supplies: 639,
  usb: 640,
  kvm: 641,
  kvm_consoles: 654,
  kvm_extenders: 655,
  kvm_cables: 656,
  kvm_modules: 657,
  adapters: 642,
  gpon: 643,
  software: 644,
  av_extenders: 659,
  av_matrix: 660,
  av_switches: 661,
  av_splitters: 662,
  av_converters: 663,
  av_cables: 664,
} as const;

function isSupportedVendor(vendor: string): boolean {
  const v = vendor.toLowerCase();
  return v.includes("d-link") || v.includes("origo") || v.includes("aten");
}

export function classifyPriceSection(title: string, vendor: string): CatalogGroup {
  const t = title.toLowerCase();
  const v = vendor.toLowerCase();
  if (!isSupportedVendor(vendor)) return "skip";

  if (v.includes("aten")) {
    if (t.includes("проданн")) return "skip";
    if (t.includes("altusen")) return "mixed";
    if (t.includes("a/v") || t.includes("a\\/v") || t.includes("профессиональн")) return "mixed";
    if (t.includes("консол") && !t.includes("удлинит")) return "kvm_consoles";
    if (t.includes("удлинит") && t.includes("консол")) return "kvm_extenders";
    if (t.includes("кабел") && (t.includes("квм") || t.includes("kvm"))) return "kvm_cables";
    if (t.includes("систем") && t.includes("управлен")) return "kvm_modules";
    if (t.includes("настольн") || t.includes("стоечн")) return "kvm";
    if (t.includes("usb")) return "usb";
    if (t.includes("квм") || t.includes("kvm")) return "kvm";
    return "skip";
  }

  // Mixed buckets — products classified by SKU later.
  if (t === "origo" || t.includes("сетевое оборудование")) return "mixed";

  if (t.includes("медиаконверт")) return "media_converters";
  if (t.includes("модул") && t.includes("кабел")) return "modules";
  if (t.includes("модул") && (t.includes("sfp") || t.includes("origo") || t.includes("d-link"))) {
    return "modules";
  }
  if (t.includes("коммутатор")) return "switches";
  if (t.includes("квм") || t.includes("kvm")) return "kvm";
  if (t.includes("адаптер")) return "adapters";
  if (t.includes("usb") || t.includes("док-станц")) return "usb";
  if (t.includes("камер") || t.includes("видеонаблюд")) return "cameras";
  if (t.includes("xdsl")) return "xdsl";
  if (t.includes("voip") || t.includes("ip-телефон") || t.includes("ip телефон")) return "voip";
  if (t.includes("программн") || t.includes("d-view") || t.includes("мониторинг")) return "software";
  if (t.includes("блок") && t.includes("питан")) return "power_supplies";
  if (t.includes("антенн")) return "wireless";
  if (t.includes("беспровод")) return "wireless";
  if (t.includes("wifi") || t.includes("wi-fi") || t.includes("access point")) return "wireless";
  if (t.includes("маршрут")) return "routers";
  if (t.includes("gpon")) return "gpon";
  if (t.includes("poe") || t.includes("power over ethernet")) return "poe";

  return "skip";
}

function classifyAtenBySku(articul: string, name: string, sectionTitle: string): CatalogGroup | null {
  const a = (articul || "").toUpperCase();
  const n = (name || "").toLowerCase();
  const section = (sectionTitle || "").toLowerCase();
  const base = a.replace(/\/.*$/, "");
  const inAv = section.includes("a/v") || section.includes("профессиональн");

  // Longer prefixes first.
  if (/^UCE|^UEH|^UE\d/.test(base)) return "usb";
  if (/^UH|^UC/.test(base)) return inAv ? "av_converters" : "usb";
  if (/^CL/.test(base)) return "kvm_consoles";
  if (/^(CE|KE)/.test(base)) return "kvm_extenders";
  if (/^(KH|KN|CS)/.test(base)) return "kvm";
  if (/^(KA|2X)/.test(base)) return inAv ? "av_converters" : "kvm_modules";
  if (/^2A|^VC/.test(base)) return "av_converters";
  if (/^VM/.test(base)) return "av_matrix";
  if (/^VS/.test(base)) {
    if (/матриц/.test(n)) return "av_matrix";
    if (/разветв|splitter|сплит/.test(n)) return "av_splitters";
    if (/переключ|switch|коммутат/.test(n)) return "av_switches";
    return "av_splitters";
  }
  if (/^VE781|^VE783/.test(base)) return "av_cables";
  if (/^VE/.test(base)) {
    if (/кабел|cable/.test(n)) return "av_cables";
    return "av_extenders";
  }
  if (/^2L-7D.*H/.test(base) || (/^2L/.test(base) && inAv)) return "av_cables";
  if (/^2L/.test(base)) return "kvm_cables";
  if (/\bkvm\b|квм/.test(n)) return "kvm";
  return null;
}

function classifyBySku(articul: string, name: string, sectionTitle = ""): CatalogGroup | null {
  const a = (articul || "").toUpperCase();
  const n = (name || "").toLowerCase();
  const base = a.replace(/\/.*$/, "");

  const atenHit = classifyAtenBySku(articul, name, sectionTitle);
  if (atenHit && (/^(CS|CL|CE|KE|KH|KN|KA|UC|UH|UCE|UE|UEH|2L|2X|2A|VE|VM|VS|VC)/.test(base) || /aten/i.test(sectionTitle))) {
    return atenHit;
  }

  if (/^DPN-/.test(base)) return "gpon";
  if (/^(DPE-|OPE)/.test(base)) return "poe";
  if (/^DPS-/.test(base) || /WPSU/.test(base)) return "power_supplies";
  if (/^(DIR-|DWR-|DWM-|DSA-|DSR-|OWR)/.test(base)) return "routers";
  if (/^(DWA-|DFE-|DGE-|DXE-)/.test(base)) return "adapters";
  if (/^(DAP-|DWL-|DNH-|DNC-|COVR-|ANT)/.test(base)) return "wireless";
  if (/^DCS-/.test(base)) return "cameras";
  if (/^DSL-/.test(base)) return "xdsl";
  if (/^(DVG-|DPH-)/.test(base)) return "voip";
  if (/^DV-/.test(base) || /d-view/.test(n)) return "software";
  if (/^(DKVM-|OKVM)/.test(base) || /\bkvm\b|квм/.test(n)) return "kvm";
  if (/^DEM-/.test(base)) return "modules";
  if (/^DMC-|^OMC-|^DIS-M/.test(base)) return "media_converters";
  if (/poe[- ]?(инжектор|удлинитель|адаптер|повторитель)/i.test(n)) return "poe";
  if (/питани/.test(n) && /(блок|источник|шасси)/.test(n)) return "power_supplies";
  if (/маршрут/.test(n)) return "routers";
  if (/usb|док-станц|хаб|dock/.test(n)) return "usb";
  return atenHit;
}

/**
 * Product-level resolve. Homogeneous price headers keep their section group;
 * wireless splits routers/adapters; mixed headers use SKU heuristics.
 */
export function classifyProductGroup(
  articul: string,
  name: string,
  sectionTitle: string,
  vendor: string,
): CatalogGroup {
  const sectionGroup = classifyPriceSection(sectionTitle, vendor);

  if (sectionGroup === "wireless") {
    const bySku = classifyBySku(articul, name, sectionTitle);
    if (bySku === "routers" || bySku === "adapters") return bySku;
    return "wireless";
  }

  if (sectionGroup === "mixed") {
    return classifyBySku(articul, name, sectionTitle) || "skip";
  }

  // Homogeneous price sections win (avoids "SFP" in switch names → modules).
  if (sectionGroup !== "skip") return sectionGroup;

  return classifyBySku(articul, name, sectionTitle) || "skip";
}

export function sectionIdForGroup(group: CatalogGroup): number | null {
  if (group === "skip" || group === "mixed") return null;
  return CATALOG_SECTION_IDS[group] ?? null;
}

export function defaultActionForSection(
  title: string,
  vendor: string,
): SectionMapAction {
  const group = classifyPriceSection(title, vendor);
  switch (group) {
    case "media_converters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.media_converters };
    case "modules":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.modules };
    case "switches":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.switches };
    case "wireless":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.wireless };
    case "routers":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.routers };
    case "kvm":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.kvm };
    case "kvm_consoles":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.kvm_consoles };
    case "kvm_extenders":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.kvm_extenders };
    case "kvm_cables":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.kvm_cables };
    case "kvm_modules":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.kvm_modules };
    case "adapters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.adapters };
    case "usb":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.usb };
    case "cameras":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.cameras };
    case "xdsl":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.xdsl };
    case "voip":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.voip };
    case "software":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.software };
    case "power_supplies":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.power_supplies };
    case "poe":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.poe };
    case "gpon":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.gpon };
    case "av_extenders":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_extenders };
    case "av_matrix":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_matrix };
    case "av_switches":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_switches };
    case "av_splitters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_splitters };
    case "av_converters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_converters };
    case "av_cables":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.av_cables };
    case "mixed":
      // Placeholder: products re-resolved per SKU in sync.
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.wireless };
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

export { BASIC_FILTERS, SWITCH_SELECTED_FILTERS };
