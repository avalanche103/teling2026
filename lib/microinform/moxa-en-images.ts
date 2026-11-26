import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { MICROINFORM_DIR } from "./paths";
import { normalizeManufacturerUrl } from "./manufacturer";
import { fetchTextWithCurlFallback } from "./http-fetch";

const MAP_PATH = path.join(MICROINFORM_DIR, "moxa-com-url-map.json");

const CATEGORY_BASES = [
  "industrial-network-infrastructure/ethernet-switches/unmanaged-switches",
  "industrial-network-infrastructure/ethernet-switches/layer-2-managed-switches",
  "industrial-network-infrastructure/ethernet-switches/layer-3-managed-switches",
  "industrial-network-infrastructure/ethernet-switches/rackmount-switches",
  "industrial-network-infrastructure/ethernet-switches/en-50155-switches",
  "industrial-network-infrastructure/ethernet-media-converters/ethernet-to-fiber-media-converters",
  "industrial-network-infrastructure/secure-routers/industrial-secure-routers",
  "industrial-network-infrastructure/secure-routers/en-50155-routers",
  "industrial-network-infrastructure/cellular-gateways-routers/cellular-routers",
  "industrial-edge-connectivity/serial-device-servers/general-device-servers",
  "industrial-edge-connectivity/serial-device-servers/industrial-device-servers",
  "industrial-edge-connectivity/serial-device-servers/entry-level-device-servers",
  "industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/usb-to-serial-converters",
  "industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/industrial-grade-usb-hubs",
  "industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways",
  "industrial-edge-connectivity/protocol-gateways/modbus-gateways",
  "industrial-edge-connectivity/protocol-gateways",
  "industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards",
  "industrial-edge-connectivity/multiport-serial-boards/pci-express-boards",
  "industrial-edge-connectivity/multiport-serial-boards/universal-pci-boards",
  "industrial-edge-connectivity/serial-converters/serial-to-serial-converters",
  "industrial-edge-connectivity/serial-converters/serial-to-fiber-converters",
  "industrial-edge-connectivity/serial-converters",
  "industrial-edge-connectivity/serial-media-converters",
  "industrial-edge-connectivity/industrial-media-converters",
  "accessories/sfp-modules/gigabit-ethernet-sfp-modules",
  "accessories/sfp-modules/fast-ethernet-sfp-modules",
];

/** Hard-coded series pages when slug heuristics miss Moxa's compound URL names. */
const SERIES_URL_SEEDS: Array<{ match: RegExp; url: string }> = [
  {
    match: /^MGATE\s*MB3[124]80/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways/mgate-mb3180-mb3280-mb3480-series",
  },
  {
    match: /^MGATE\s*MB3[12]70/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways/mgate-mb3170-mb3270-series",
  },
  {
    match: /^SFP-1G/i,
    url: "https://www.moxa.com/en/products/accessories/sfp-modules/gigabit-ethernet-sfp-modules/sfp-1g-series",
  },
  {
    match: /^SFP-1FE/i,
    url: "https://www.moxa.com/en/products/accessories/sfp-modules/fast-ethernet-sfp-modules/sfp-1fe-series",
  },
  {
    match: /^TCC-?80/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/serial-converters/serial-to-serial-converters/tcc-80-80i-series",
  },
  {
    match: /^UPORT\s*14\d{2}/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/usb-to-serial-converters/uport-1400-g2-series",
  },
  {
    match: /^UPORT\s*40[47]/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/industrial-grade-usb-hubs/uport-404-407-series",
  },
  {
    match: /^CP-114EL/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-114el-series",
  },
  {
    match: /^CP-132EL/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-132el-series",
  },
  {
    match: /^CP-134EL/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-134el-a-i-series",
  },
  {
    match: /^CP-118E/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-118e-a-i-138e-a-i-series",
  },
  {
    match: /^CP-102UL/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-102u-102ul-series",
  },
  {
    match: /^CP-104EL/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards/cp-104el-a-series",
  },
  {
    match: /^EDR-G9010/i,
    url: "https://www.moxa.com/en/products/industrial-network-infrastructure/secure-routers/secure-routers/edr-g9010-series",
  },
  {
    match: /^ICF-1150/i,
    url: "https://www.moxa.com/en/products/industrial-edge-connectivity/serial-converters/serial-to-fiber-converters/icf-1150-series",
  },
  {
    match: /^IMC-21GA/i,
    url: "https://www.moxa.com/en/products/industrial-network-infrastructure/ethernet-media-converters/ethernet-to-fiber-media-converters/imc-21ga-series",
  },
];

let mapCache: Record<string, string> | null = null;

function readMap(): Record<string, string> {
  if (mapCache) return mapCache;
  if (!existsSync(MAP_PATH)) {
    mapCache = {};
    return mapCache;
  }
  try {
    const raw = JSON.parse(readFileSync(MAP_PATH, "utf8")) as Record<string, string>;
    mapCache = raw && typeof raw === "object" ? raw : {};
  } catch {
    mapCache = {};
  }
  return mapCache;
}

export function writeMoxaComUrlMap(map: Record<string, string>): void {
  mapCache = map;
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
}

function mapKey(articul: string): string {
  return (articul || "").trim().toUpperCase();
}

/** Strip option tails to get a series / base model slug. */
export function moxaSeriesSlugs(articul: string): string[] {
  let s = (articul || "").trim();
  if (!s) return [];
  s = s.replace(/\s+/g, " ");
  s = s.replace(/-T$/i, "");
  s = s.replace(/-G2$/i, "");
  s = s.replace(/-DB9M?$/i, "");
  s = s.replace(/-(VPN|CT)$/i, "");
  // Fiber / optic option tails: -M-SC, -S-SC, -LX-SC, -SX-LC, -LHX-LC…
  s = s.replace(/-(MM|SS|M|S|LX|SX|LSX|LH|LHX|ZX)?-?(SC|ST|LC)(-\d+)?$/i, "");
  s = s.replace(/-\d*(GTX|MG)?SFP.*$/i, "");
  s = s.replace(/-\d*PoE.*$/i, "");
  s = s.replace(/-(HV|WV|F)(-HV|-WV|-F)*$/i, "");
  // Power dual-input tails only (not model numbers like TCC-80).
  s = s.replace(/-(?:12|24|48|110|220)(?:-(?:12|24|48|110|220))?$/i, "");
  s = s.replace(/\/.*$/, ""); // CBL weird tails
  // Isolation suffix: ICF-1150I → ICF-1150, CP-114EL-I → CP-114EL
  s = s.replace(/([A-Z0-9])-?I$/i, "$1");

  const spaced = s.trim();
  const compact = spaced.replace(/\s+/g, "");
  const dashed = spaced.toLowerCase().replace(/\s+/g, "-");
  const slugs = new Set<string>([dashed]);

  // Family core: eds-408a, nport-5110, mgate-mb3180, uport-1110
  const family =
    compact.match(/^((?:EDS|IKS|ICS|PT|TN|IMC|SFP|EDR|ME)[A-Z0-9-]*)/i)?.[1] ||
    spaced.match(/^(NPort|UPort|MGate|OnCell)\s*([A-Za-z0-9-]+)/i)?.[0] ||
    compact.match(/^((?:CP|CI|TCC|ICF|CBL)[A-Z0-9-]*)/i)?.[1];
  if (family) {
    const famSlug = family.toLowerCase().replace(/\s+/g, "-");
    slugs.add(famSlug);
    // EDS-408A-SS… already stripped; also try shorter EDS-408A if longer remains
    const short = famSlug.match(/^([a-z]+-?[a-z]?\d{2,4}[a-z]?)/);
    if (short?.[1]) slugs.add(short[1]);
    // Drop trailing isolation "i": icf-1150i → icf-1150
    if (/i$/i.test(famSlug) && famSlug.length > 5) {
      slugs.add(famSlug.replace(/i$/i, ""));
    }
  }

  // NPort 5110A → nport-5110 / nport-5100 series family
  const nport = spaced.match(/^(NPort|UPort|MGate)\s*([A-Za-z0-9-]+)/i);
  if (nport) {
    const brand = nport[1].toLowerCase();
    const rest = String(nport[2]);
    const num = rest.replace(/[^0-9].*$/, "");
    if (num.length >= 3) {
      slugs.add(`${brand}-${num}`);
      const n = Number(num);
      if (Number.isFinite(n) && n >= 100) {
        // 5110 → 5100, 5210 → 5200, 1150 → 1100
        const series = Math.floor(n / 100) * 100;
        slugs.add(`${brand}-${series}`);
        if (brand === "uport") slugs.add(`uport-${series}-g2`);
      }
    }
    // MGate MB3180 → mgate-mb3180 / compound series names
    const mb = rest.match(/^MB(\d{4})/i);
    if (brand === "mgate" && mb?.[1]) {
      const code = mb[1];
      slugs.add(`mgate-mb${code}`);
      slugs.add(`mgate-mb${code.slice(0, -2)}00`);
      slugs.add("mgate-mb3000");
      if (/^3[124]80$/.test(code)) slugs.add("mgate-mb3180-mb3280-mb3480");
      if (/^3[12]70$/.test(code)) slugs.add("mgate-mb3170-mb3270");
    }
    // Industrial NPort IA-5150 / IA5150A → nport-ia5000 family
    if (/^IA/i.test(rest)) {
      slugs.add("nport-ia5000");
      slugs.add("nport-ia5150");
      slugs.add("nport-ia5250");
      slugs.add("nport-ia5450");
    }
  }

  // CP-114EL → cp-114el; SFP-1GSXLC → sfp-1g; TCC-80 → tcc-80-80i
  const cp = compact.match(/^(CP-\d{2,4}[A-Z]*(?:-[A-Z]+)?)/i);
  if (cp?.[1]) {
    const base = cp[1].toLowerCase().replace(/-i$/i, "");
    slugs.add(base);
    const core = base.match(/^(cp-\d{2,4}[a-z]*)/i);
    if (core?.[1]) slugs.add(core[1]);
  }
  if (/^SFP-1G/i.test(compact)) slugs.add("sfp-1g");
  if (/^SFP-1FE/i.test(compact)) slugs.add("sfp-1fe");
  if (/^TCC-?80/i.test(compact)) slugs.add("tcc-80-80i");
  if (/^UPORT\s*40[47]/i.test(spaced) || /^UPORT40[47]/i.test(compact)) {
    slugs.add("uport-404-407");
  }
  if (/^EDR-G9010/i.test(compact)) slugs.add("edr-g9010");
  if (/^IMC-21GA/i.test(compact)) slugs.add("imc-21ga");
  if (/^ICF-1150/i.test(compact)) slugs.add("icf-1150");

  return [...slugs].filter((x) => x.length >= 4);
}

export function moxaModelStems(articul: string): string[] {
  const raw = (articul || "").trim();
  if (!raw) return [];
  const noSpace = raw.replace(/\s+/g, " ").trim();
  const withoutT = noSpace.replace(/-T$/i, "");
  return [...new Set([
    noSpace,
    noSpace.replace(/\s+/g, ""),
    noSpace.replace(/\s+/g, "_"),
    noSpace.replace(/\s+/g, "-"),
    withoutT,
    withoutT.replace(/\s+/g, ""),
    withoutT.replace(/\s+/g, "_"),
    withoutT.replace(/\s+/g, "-"),
    ...moxaSeriesSlugs(articul),
  ])].filter(Boolean);
}

function isSoft404(url: string): boolean {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "").toLowerCase();
    if (p === "" || p === "/en" || p === "/en/products" || p === "/products") return true;
    if (p === "/en/search" || p.startsWith("/en/search")) return true;
    // Category indexes without a concrete series/model slug.
    if (/\/en\/products\/.+(switches|converters|gateways|boards|accessories|routers)$/i.test(p)) {
      return true;
    }
    if (/\/en\/products\/accessories(\/power-accessories)?$/i.test(p)) return true;
    return false;
  } catch {
    return true;
  }
}

export function candidateMoxaEnglishUrls(articul: string, priceUrl?: string | null): string[] {
  const out: string[] = [];
  const push = (url: string) => {
    const n = normalizeManufacturerUrl(url);
    if (!n || !/^https?:\/\/(www\.)?moxa\.com\//i.test(n)) return;
    if (isSoft404(n)) return;
    if (!out.includes(n)) out.push(n);
  };

  const mapped = readMap()[mapKey(articul)];
  if (mapped) push(mapped);
  if (priceUrl && /moxa\.com(?!\.ua)/i.test(priceUrl)) push(priceUrl);

  for (const seed of SERIES_URL_SEEDS) {
    if (seed.match.test(articul)) push(seed.url);
  }

  // Prefer modern series pages under likely categories for this product family.
  const slugs = moxaSeriesSlugs(articul).slice(0, 4);
  const cats = likelyCategories(articul);
  for (const slug of slugs) {
    for (const cat of cats) {
      push(`https://www.moxa.com/en/products/${cat}/${slug}-series`);
    }
  }

  // Legacy product/*.htm — still works for some lines.
  for (const stem of moxaModelStems(articul).slice(0, 3)) {
    const underscored = stem.replace(/\s+/g, "_");
    const compact = stem.replace(/\s+/g, "");
    push(`https://www.moxa.com/product/${underscored}.htm`);
    push(`https://www.moxa.com/product/${compact}.htm`);
  }

  return out.slice(0, 18);
}

function likelyCategories(articul: string): string[] {
  const a = (articul || "").toUpperCase();
  if (/^(EDS|IKS|ICS|SDS)/.test(a)) {
    return [
      "industrial-network-infrastructure/ethernet-switches/unmanaged-switches",
      "industrial-network-infrastructure/ethernet-switches/layer-2-managed-switches",
      "industrial-network-infrastructure/ethernet-switches/layer-3-managed-switches",
      "industrial-network-infrastructure/ethernet-switches/rackmount-switches",
    ];
  }
  if (/^(PT-|TN-)/.test(a)) {
    return [
      "industrial-network-infrastructure/ethernet-switches/en-50155-switches",
      "industrial-network-infrastructure/ethernet-switches/rackmount-switches",
      "industrial-network-infrastructure/secure-routers/en-50155-routers",
    ];
  }
  if (/^IMC|^ME\d/.test(a)) {
    return [
      "industrial-network-infrastructure/ethernet-media-converters/ethernet-to-fiber-media-converters",
      "industrial-edge-connectivity/industrial-media-converters",
    ];
  }
  if (/^NPORT|^IA-/.test(a)) {
    return [
      "industrial-edge-connectivity/serial-device-servers/general-device-servers",
      "industrial-edge-connectivity/serial-device-servers/industrial-device-servers",
      "industrial-edge-connectivity/serial-device-servers/entry-level-device-servers",
    ];
  }
  if (/^UPORT\s*40/.test(a)) {
    return [
      "industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/industrial-grade-usb-hubs",
      "industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/usb-to-serial-converters",
    ];
  }
  if (/^UPORT/.test(a)) {
    return [
      "industrial-edge-connectivity/usb-to-serial-converters-usb-hubs/usb-to-serial-converters",
    ];
  }
  if (/^MGATE|^IOLOGIK/.test(a)) {
    return [
      "industrial-edge-connectivity/protocol-gateways/modbus-tcp-gateways",
      "industrial-edge-connectivity/protocol-gateways/modbus-gateways",
      "industrial-edge-connectivity/protocol-gateways",
    ];
  }
  if (/^(CP-|CI-)/.test(a)) {
    return [
      "industrial-edge-connectivity/multiport-serial-boards/pcie-upci-pci-serial-cards",
      "industrial-edge-connectivity/multiport-serial-boards/pci-express-boards",
      "industrial-edge-connectivity/multiport-serial-boards/universal-pci-boards",
      "industrial-edge-connectivity/multiport-serial-boards/pc-104-serial-boards",
    ];
  }
  if (/^ICF/.test(a)) {
    return [
      "industrial-edge-connectivity/serial-converters/serial-to-fiber-converters",
      "industrial-edge-connectivity/serial-converters",
      "industrial-edge-connectivity/serial-media-converters",
    ];
  }
  if (/^TCC/.test(a)) {
    return [
      "industrial-edge-connectivity/serial-converters/serial-to-serial-converters",
      "industrial-edge-connectivity/serial-converters",
    ];
  }
  if (/^SFP-1G/.test(a)) {
    return ["accessories/sfp-modules/gigabit-ethernet-sfp-modules"];
  }
  if (/^SFP-1FE|^SFP-/.test(a)) {
    return [
      "accessories/sfp-modules/fast-ethernet-sfp-modules",
      "accessories/sfp-modules/gigabit-ethernet-sfp-modules",
    ];
  }
  if (/^EDR-/.test(a)) {
    return [
      "industrial-network-infrastructure/secure-routers/secure-routers",
      "industrial-network-infrastructure/network-security-appliance",
      "industrial-network-infrastructure/secure-routers/en-50155-routers",
    ];
  }
  if (/^(CBL|WK-|RK-|DK|M12|CN\d|PWR-|DR-|HDR-|MDR-|DRP)/.test(a)) {
    // Accessories rarely have dedicated EN packshot pages worth probing.
    return ["accessories"];
  }
  return CATEGORY_BASES.slice(0, 6);
}

async function urlExists(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const finalUrl = normalizeManufacturerUrl(res.url || url);
    if (!finalUrl || isSoft404(finalUrl)) return null;
    return finalUrl;
  } catch {
    return null;
  }
}

/** Reuse a cached series page from a sibling SKU (NPort 5110A ← NPort 5110). */
function lookupSiblingSeriesUrl(articul: string, map: Record<string, string>): string | null {
  const slugs = new Set(moxaSeriesSlugs(articul).map((s) => s.toLowerCase()));
  if (!slugs.size) return null;
  for (const url of Object.values(map)) {
    if (!url || isSoft404(url)) continue;
    const path = url.toLowerCase();
    for (const slug of slugs) {
      if (
        path.includes(`/${slug}-series`) ||
        path.includes(`/${slug}/`) ||
        path.endsWith(`/${slug}`) ||
        path.includes(`/${slug}-`)
      ) {
        return normalizeManufacturerUrl(url);
      }
    }
  }
  // TCC-100I → reuse tcc-100-100i-series from TCC-100
  const tcc = articul.match(/^TCC-?(\d+)/i);
  if (tcc?.[1]) {
    const needle = `tcc-${tcc[1]}`;
    for (const url of Object.values(map)) {
      if (url && url.toLowerCase().includes(needle)) return normalizeManufacturerUrl(url);
    }
  }
  return null;
}

/** Resolve a working moxa.com product/series page for packshots. */
export async function resolveMoxaEnglishUrl(
  articul: string,
  priceUrl?: string | null,
): Promise<string | null> {
  const key = mapKey(articul);
  const map = readMap();
  if (map[key] && !isSoft404(map[key]!)) return normalizeManufacturerUrl(map[key]!);

  for (const seed of SERIES_URL_SEEDS) {
    if (!seed.match.test(articul)) continue;
    const candidate = normalizeManufacturerUrl(seed.url);
    if (!candidate || isSoft404(candidate)) continue;
    const hit = await urlExists(candidate);
    if (hit) {
      map[key] = hit;
      writeMoxaComUrlMap(map);
      return hit;
    }
  }

  const sibling = lookupSiblingSeriesUrl(articul, map);
  if (sibling) {
    map[key] = sibling;
    writeMoxaComUrlMap(map);
    return sibling;
  }

  const candidates = candidateMoxaEnglishUrls(articul, priceUrl);
  // Probe in small parallel batches for speed.
  const batchSize = 6;
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize);
    const results = await Promise.all(batch.map((u) => urlExists(u)));
    const hit = results.find((r): r is string => Boolean(r));
    if (hit) {
      map[key] = hit;
      writeMoxaComUrlMap(map);
      return hit;
    }
  }
  return null;
}

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function scoreEnImage(url: string, articul: string): number {
  const u = url.toLowerCase();
  if (!/\.(jpe?g|png|webp)(\?|$)/i.test(u) && !/ext=\.(jpe?g|png|webp)/i.test(u)) return -1;
  if (/logo|icon|favicon|ajax-loader|cybersecurity|mail\.svg|artboard|distributor/i.test(u)) {
    return -1;
  }
  if (/\/category\//i.test(u)) return 40;
  let score = 50;
  if (/getattachment|azurefd\.net|cdn-cms/i.test(u)) score += 80;
  if (/\/products\//i.test(u)) score += 40;
  if (/-image(?:-\d+)?(?:-\(\d+\))?/i.test(u)) score += 60;

  const raw = (articul || "").trim();
  const exact = raw.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const file = u.replace(/[^a-z0-9]+/g, "");
  if (exact.length >= 4 && file.includes(exact)) {
    score += 200;
  } else {
    const stems = moxaModelStems(articul).map((s) =>
      s.toLowerCase().replace(/[^a-z0-9]+/g, ""),
    );
    for (const stem of stems) {
      if (stem.length >= 4 && file.includes(stem)) {
        score += 100;
        break;
      }
    }
  }

  if (!/-t$/i.test(raw) && /nport-\d+[a-z]*-t-image|\/[a-z0-9-]+-t\/moxa-/i.test(u)) {
    score -= 150;
  }
  if (/series-image/i.test(u)) score += 20;
  return score;
}

/** Extract ranked product packshots from a moxa.com HTML page. */
export function extractMoxaEnglishImages(
  pageUrl: string,
  html: string,
  articul: string,
): string[] {
  const $ = cheerio.load(html);
  const collected = new Set<string>();
  const push = (href: string | undefined | null) => {
    if (!href) return;
    const abs = absoluteUrl(pageUrl, href.trim());
    if (!abs) return;
    if (scoreEnImage(abs, articul) < 50) return;
    const cleaned = abs.includes("?ext=")
      ? abs.slice(0, abs.indexOf("?ext=")) + abs.slice(abs.indexOf("?ext="))
      : abs.split("?")[0]!;
    collected.add(cleaned);
  };

  $("meta[property='og:image'], meta[name='twitter:image']").each((_, el) => {
    push($(el).attr("content"));
  });
  $("img").each((_, el) => {
    push($(el).attr("src"));
    push($(el).attr("data-src"));
    push($(el).attr("data-lazy"));
  });
  $("[srcset]").each((_, el) => {
    const srcset = $(el).attr("srcset") || "";
    for (const part of srcset.split(",")) {
      push(part.trim().split(/\s+/)[0]);
    }
  });
  for (const m of html.matchAll(
    /https?:\/\/[^"'\\\s>]*(?:getattachment|azurefd\.net|cdn-cms)[^"'\\\s>]+\.(?:jpe?g|png|webp)/gi,
  )) {
    push(m[0]);
  }

  const ranked = [...collected]
    .map((url) => ({ url, score: scoreEnImage(url, articul) }))
    .filter((x) => x.score >= 80)
    .sort((a, b) => b.score - a.score);

  const exactHit = ranked.find((x) => x.score >= 280);
  const kept = exactHit ? ranked.filter((x) => x.score >= 200) : ranked;
  return kept.map((x) => x.url).slice(0, 4);
}

export async function fetchMoxaEnglishImageUrls(
  articul: string,
  priceUrl?: string | null,
): Promise<{ pageUrl: string | null; imageUrls: string[] }> {
  const pageUrl = await resolveMoxaEnglishUrl(articul, priceUrl);
  if (!pageUrl) return { pageUrl: null, imageUrls: [] };
  try {
    const html = await fetchTextWithCurlFallback(pageUrl);
    return { pageUrl, imageUrls: extractMoxaEnglishImages(pageUrl, html, articul) };
  } catch {
    return { pageUrl, imageUrls: [] };
  }
}
