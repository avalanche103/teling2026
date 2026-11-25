import type { SectionMapAction } from "./store";
import { SWITCH_SELECTED_FILTERS } from "./switch-chars";

export type CatalogGroup =
  | "switches"
  | "routers"
  | "wireless"
  | "media_converters"
  | "modules"
  | "dac"
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
  | "ups"
  | "ups_batteries"
  | "ups_inverters"
  | "ups_bypass"
  | "ups_mgmt"
  | "ups_mounts"
  | "pdu"
  | "serial_ethernet"
  | "serial_converters"
  | "serial_gateways_boards"
  | "industrial_accessories"
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
  dac: 669,
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
  ups: 519,
  ups_batteries: 520,
  ups_inverters: 665,
  ups_bypass: 666,
  ups_mgmt: 667,
  ups_mounts: 668,
  pdu: 508,
  serial_ethernet: 671,
  serial_converters: 672,
  serial_gateways_boards: 673,
  industrial_accessories: 674,
} as const;

function isUpsVendor(vendor: string): boolean {
  const v = vendor.toLowerCase();
  return (
    v.includes("svc") ||
    v.includes("informix") ||
    v.includes("infromix") ||
    v.includes("systeme")
  );
}

function isMoxaVendor(vendor: string): boolean {
  return vendor.toLowerCase().includes("moxa");
}

function isSupportedVendor(vendor: string): boolean {
  const v = vendor.toLowerCase();
  return (
    v.includes("d-link") ||
    v.includes("origo") ||
    v.includes("aten") ||
    isMoxaVendor(vendor) ||
    isUpsVendor(vendor)
  );
}

function classifyUpsPriceSection(title: string, vendor: string): CatalogGroup {
  const t = title.toLowerCase();
  const v = vendor.toLowerCase();

  // Systeme: one mixed header — classify per SKU.
  if (v.includes("systeme")) return "mixed";

  // INFORMIX header (1) mixes battery module + bypass + (rarely) other.
  if (t.includes("(1) informix") || (t.includes("informix") && t.includes("источник"))) {
    return "mixed";
  }

  if (t.includes("батар")) return "ups_batteries";
  if (t.includes("инверт")) return "ups_inverters";
  if (t.includes("модул") && t.includes("управ")) return "ups_mgmt";
  if (t.includes("монтаж")) return "ups_mounts";
  if (t.includes("pdu") || t.includes("распредел")) return "pdu";
  if (t.includes("опци") || t.includes("байпас")) return "ups_bypass";

  if (
    t.includes("ибп") ||
    t.includes("бесперебой") ||
    t.includes("ups") ||
    t.includes("онлайн") ||
    t.includes("back ups") ||
    t.includes("smart-ups") ||
    t.includes("серия")
  ) {
    return "ups";
  }

  return "mixed";
}

export function classifyUpsBySku(
  articul: string,
  name: string,
  sectionTitle = "",
): CatalogGroup | null {
  const a = (articul || "").toUpperCase().replace(/\s+/g, "");
  const n = (name || "").toLowerCase();
  const t = (sectionTitle || "").toLowerCase();
  const hay = `${n} ${t} ${a.toLowerCase()}`;

  if (/^DI-/.test(a) || /инвертор/.test(n)) return "ups_inverters";
  if (/^EMBS/.test(a) || /байпас/.test(n) || (/inf-pdu/i.test(a) && /байпас/.test(n))) {
    return "ups_bypass";
  }
  if (/inf-pdu/i.test(a) && /байпас|bypass/i.test(hay)) return "ups_bypass";
  if (/inf-pdu/i.test(a)) return "ups_bypass";

  if (
    /^BAT/i.test(a) ||
    /^BPSE/i.test(a) ||
    /inf-bat/i.test(a) ||
    (/батар/.test(n) && !/ибп|источник бесперебой/.test(n))
  ) {
    return "ups_batteries";
  }

  if (
    /^SE2RK/i.test(a) ||
    /^RAIL/i.test(a) ||
    /^BFT-UPS/i.test(a) ||
    /рельс|монтажн|креплен/.test(n)
  ) {
    return "ups_mounts";
  }

  if (
    /^DA80/i.test(a) ||
    /NETFEELER/i.test(a) ||
    /^SE9604/i.test(a) ||
    /^SE9622/i.test(a) ||
    /snmp|сетевая карта|датчик/.test(n)
  ) {
    return "ups_mgmt";
  }

  if (/\bpdu\b|распредел.*питан|блок распределения/.test(n) || t.includes("pdu")) {
    return "pdu";
  }

  if (
    /ибп|бесперебой|\bups\b|онлайн|line-interactive|линейно-интерактив|smart-save|back-save|galaxy/.test(
      n,
    ) ||
    /^(V-|U-|W-|RT-|RTS-|PTS-|TRX|RTO-|INF-|BVSE|SMTSE|SRTSE|SRVSE)/i.test(a)
  ) {
    return "ups";
  }

  return null;
}

function classifyMoxaPriceSection(title: string): CatalogGroup {
  const t = title.toLowerCase();
  if (t.includes("(by)")) return "skip";
  if (t.includes("проект")) return "mixed";
  if (t.includes("промышленн") && t.includes("коммутатор")) return "mixed";
  if (t.includes("беспровод")) return "mixed";
  if (t.includes("ethernet") && (t.includes("rs-232") || t.includes("rs232"))) {
    return "serial_ethernet";
  }
  if (t.includes("преобразовател") && t.includes("сред")) return "industrial_accessories";
  if (t.includes("медиаконверт")) return "media_converters";
  if (t.includes("usb")) return "serial_converters";
  if (t.includes("оптик")) return "serial_converters";
  if (t.includes("rs-232") && (t.includes("rs-422") || t.includes("rs-485"))) {
    return "serial_converters";
  }
  if (t.includes("modbus") || t.includes("profibus")) return "serial_gateways_boards";
  if (t.includes("плат") || t.includes("pci") || t.includes("isa")) {
    return "serial_gateways_boards";
  }
  if (t.includes("блок") && t.includes("питан")) return "power_supplies";
  if (t.includes("sfp") || (t.includes("модул") && t.includes("sfp"))) return "modules";
  return "skip";
}

export function classifyMoxaBySku(
  articul: string,
  name: string,
  sectionTitle = "",
): CatalogGroup | null {
  const a = (articul || "").toUpperCase().replace(/\s+/g, " ").trim();
  const compact = a.replace(/\s+/g, "");
  const n = (name || "").toLowerCase();
  const t = (sectionTitle || "").toLowerCase();
  const hay = `${n} ${t}`;

  if (/^NPORT/i.test(a) || /^NPORT/i.test(compact)) return "serial_ethernet";
  if (/^UPORT/i.test(a) || /^UPORT/i.test(compact)) return "serial_converters";
  if (/^ICF/i.test(compact)) return "serial_converters";
  if (/^TCC/i.test(compact)) return "serial_converters";
  if (/^MGATE/i.test(a) || /^MGATE/i.test(compact)) return "serial_gateways_boards";
  if (/^IOLOGIK/i.test(a) || /^IOLOGIK/i.test(compact)) return "serial_gateways_boards";
  if (/^(CP-|CI-)/i.test(compact)) return "serial_gateways_boards";
  if (
    /^(CBL-|CN\d|DK35|WK-|RK-|M12|MINIDB)/i.test(compact) ||
    /кабел|креплен|монтажн|разъем|разъём|din rail/.test(hay)
  ) {
    return "industrial_accessories";
  }
  if (/^IMC/i.test(compact) || /медиаконверт/.test(hay)) return "media_converters";
  if (/^SFP-/i.test(compact) || (/модуль/.test(n) && /sfp/.test(hay))) return "modules";
  if (/^(DR-|DRP-|HDR-)/i.test(compact) || (/блок/.test(n) && /питан/.test(n))) {
    return "power_supplies";
  }
  if (/^ANT/i.test(compact) || /антенн/.test(n)) return "wireless";
  if (/^EDR|^ONCELL/i.test(compact) || /маршрут/.test(n)) return "routers";
  if (
    /^(EDS|IKS|SDS|PT-|TN-|TRS)/i.test(compact) ||
    /коммутатор|ethernet switch/.test(hay)
  ) {
    return "switches";
  }
  return null;
}

export function classifyPriceSection(title: string, vendor: string): CatalogGroup {
  const t = title.toLowerCase();
  const v = vendor.toLowerCase();
  if (!isSupportedVendor(vendor)) return "skip";

  if (isUpsVendor(vendor)) {
    return classifyUpsPriceSection(title, vendor);
  }

  if (isMoxaVendor(vendor)) {
    return classifyMoxaPriceSection(title);
  }

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

  const upsHit = classifyUpsBySku(articul, name, sectionTitle);
  if (upsHit) return upsHit;

  const moxaHit = classifyMoxaBySku(articul, name, sectionTitle);
  if (moxaHit && (/moxa/i.test(sectionTitle) || /moxa/i.test(name) || /^(NPORT|UPORT|MGATE|IOLOGIK|ICF|TCC|EDS|IKS|IMC|SFP-|EDR|ONCELL|CP-|CI-|CBL-)/i.test(base.replace(/\s+/g, "")))) {
    return moxaHit;
  }

  const atenHit = classifyAtenBySku(articul, name, sectionTitle);
  if (atenHit && (/^(CS|CL|CE|KE|KH|KN|KA|UC|UH|UCE|UE|UEH|2L|2X|2A|VE|VM|VS|VC)/.test(base) || /aten/i.test(sectionTitle))) {
    return atenHit;
  }

  if (/^DPN-/.test(base)) return "gpon";
  if (/^(DPE-|OPE)/.test(base)) return "poe";
  if (/^DPS-/.test(base) || /^DIS-PWR/.test(base) || /WPSU/.test(base)) {
    return "power_supplies";
  }
  if (/^(DIR-|DWR-|DWM-|DSA-|DSR-|OWR)/.test(base)) return "routers";
  if (/^(DWA-|DFE-|DGE-|DXE-)/.test(base)) return "adapters";
  if (/^(DAP-|DWL-|DNH-|DNC-|COVR-|ANT)/.test(base)) return "wireless";
  if (/^DCS-/.test(base)) return "cameras";
  if (/^DSL-/.test(base)) return "xdsl";
  if (/^(DVG-|DPH-)/.test(base)) return "voip";
  if (/^DV-/.test(base) || /d-view/.test(n) || /лицензи/.test(n)) return "software";
  if (/^(DKVM-|OKVM)/.test(base) || /\bkvm\b|квм/.test(n)) return "kvm";
  if (isDacSkuOrName(base, n)) return "dac";
  // Industrial SFP (S301SX / S302SX) and DEM-/OFM modules.
  if (/^S30\d/.test(base) || /^DEM-/.test(base) || /^OFM/.test(base)) return "modules";
  if (/^DMC-|^OMC-|^DIS-M/.test(base)) return "media_converters";
  if (/poe[- ]?(инжектор|удлинитель|адаптер|повторитель)/i.test(n)) return "poe";
  if (
    /питани/.test(n) &&
    /(блок|источник|шасси|адаптер)/.test(n) &&
    !/бесперебой|ибп|\bups\b/.test(n)
  ) {
    return "power_supplies";
  }
  if (/маршрут/.test(n)) return "routers";
  // UPort / industrial USB-serial stay in MOXA serial converters, not generic USB.
  if (moxaHit === "serial_converters") return moxaHit;
  if (/usb|док-станц|хаб|dock/.test(n)) return "usb";
  return moxaHit || atenHit;
}

/** DEM-CB / OFM-CB / DAC / stacking / direct-attach copper interconnects. */
function isDacSkuOrName(articulBase: string, nameLower: string): boolean {
  if (/^DEM-CB/.test(articulBase) || /^OFM-CB/.test(articulBase)) return true;
  return (
    /\bdac\b/.test(nameLower) ||
    /twinax/.test(nameLower) ||
    /direct\s*attach/.test(nameLower) ||
    /прямого\s+подключ/.test(nameLower) ||
    /stacking\s+cable/.test(nameLower)
  );
}

/**
 * Clear non-switch accessories that appear inside «Коммутаторы» price lists.
 * Real switches (names with «коммутатор») are left alone even if they mention SFP ports.
 */
function classifyAccessoryOverride(articul: string, name: string): CatalogGroup | null {
  const n = (name || "").toLowerCase();
  const looksLikeSwitch =
    /коммутатор|\bswitch\b/.test(n) &&
    !/трансивер|медиаконверт|лицензи|(блок|источник|адаптер).{0,20}питани|питани.{0,40}(блок|источник|адаптер)/.test(
      n,
    );
  if (looksLikeSwitch) return null;

  const a = (articul || "").toUpperCase().replace(/\/.*$/, "");
  if (isDacSkuOrName(a, n)) return "dac";
  if (/^S30\d/.test(a) || /^DEM-/.test(a) || /^OFM/.test(a)) return "modules";
  if (
    /sfp[- ]?трансивер|трансивер.*\bsfp\b|\bsfp\b.*трансивер|модуль\s+sfp|оптический\s+трансивер/.test(
      n,
    )
  ) {
    return "modules";
  }
  if (/медиаконверт/.test(n) || /^DMC-|^OMC-|^DIS-M/.test(a)) return "media_converters";
  if (
    /^DIS-PWR|^DPS-/.test(a) ||
    (/(блок|источник|адаптер)/.test(n) &&
      /питани/.test(n) &&
      !/бесперебой|ибп|\bups\b|распредел|\bpdu\b|розет/.test(n))
  ) {
    return "power_supplies";
  }
  if (/лицензи/.test(n)) return "software";
  return null;
}

const UPS_SECTION_GROUPS = new Set<CatalogGroup>([
  "ups",
  "ups_batteries",
  "ups_inverters",
  "ups_bypass",
  "ups_mgmt",
  "ups_mounts",
  "pdu",
]);

const MOXA_SECTION_GROUPS = new Set<CatalogGroup>([
  "serial_ethernet",
  "serial_converters",
  "serial_gateways_boards",
  "industrial_accessories",
]);

/**
 * Product-level resolve. Homogeneous price headers keep their section group;
 * wireless splits routers/adapters; mixed headers use SKU heuristics.
 * Accessory overrides catch SFP/media/PSU rows that vendors list under switches.
 */
export function classifyProductGroup(
  articul: string,
  name: string,
  sectionTitle: string,
  vendor: string,
): CatalogGroup {
  const sectionGroup = classifyPriceSection(sectionTitle, vendor);

  if (isMoxaVendor(vendor)) {
    if (sectionGroup === "mixed" || sectionGroup === "skip") {
      return classifyMoxaBySku(articul, name, sectionTitle) || "skip";
    }
    // Homogeneous MOXA serial headers win; still peel SFP/PSU misfiles from switch-like bags.
    if (!MOXA_SECTION_GROUPS.has(sectionGroup)) {
      const accessory = classifyAccessoryOverride(articul, name);
      if (accessory) return accessory;
      // Industrial switch headers can still contain a router SKU via override above only.
      if (sectionGroup === "switches" || sectionGroup === "media_converters") {
        const bySku = classifyMoxaBySku(articul, name, sectionTitle);
        if (bySku === "routers" || bySku === "modules" || bySku === "power_supplies") {
          return bySku;
        }
      }
    }
    return sectionGroup;
  }

  if (sectionGroup === "wireless") {
    const bySku = classifyBySku(articul, name, sectionTitle);
    if (bySku === "routers" || bySku === "adapters") return bySku;
    return "wireless";
  }

  if (sectionGroup === "mixed") {
    return classifyBySku(articul, name, sectionTitle) || "skip";
  }

  // Do not reclassify UPS/PDU price sections as network PSUs (639).
  if (!UPS_SECTION_GROUPS.has(sectionGroup)) {
    const accessory = classifyAccessoryOverride(articul, name);
    if (accessory) return accessory;
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
    case "dac":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.dac };
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
    case "ups":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups };
    case "ups_batteries":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups_batteries };
    case "ups_inverters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups_inverters };
    case "ups_bypass":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups_bypass };
    case "ups_mgmt":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups_mgmt };
    case "ups_mounts":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups_mounts };
    case "pdu":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.pdu };
    case "serial_ethernet":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.serial_ethernet };
    case "serial_converters":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.serial_converters };
    case "serial_gateways_boards":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.serial_gateways_boards };
    case "industrial_accessories":
      return { action: "existing", sectionId: CATALOG_SECTION_IDS.industrial_accessories };
    case "mixed":
      // Placeholder: products re-resolved per SKU in sync.
      if (isUpsVendor(vendor)) {
        return { action: "existing", sectionId: CATALOG_SECTION_IDS.ups };
      }
      if (isMoxaVendor(vendor)) {
        return { action: "existing", sectionId: CATALOG_SECTION_IDS.switches };
      }
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
