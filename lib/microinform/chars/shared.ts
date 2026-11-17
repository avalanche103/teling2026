import type { ProductCharGroup } from "@/lib/types";

export const SYNTHETIC_GROUP = "Характеристики";

export type CharItem = { name: string; value: string };

export type CharInput = {
  sectionTitle: string;
  name: string;
  articul: string;
  enrichedGroups?: ProductCharGroup[];
};

export function has(text: string, ...needles: string[]): boolean {
  const hay = text.toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

export function blobOf(input: CharInput): string {
  return `${input.sectionTitle} ${input.name} ${input.articul}`;
}

export function findItemValues(
  groups: ProductCharGroup[] | undefined,
  itemName: string,
): string[] {
  const out: string[] = [];
  for (const group of groups || []) {
    if (group.name === SYNTHETIC_GROUP) continue;
    for (const item of group.items || []) {
      if (item.name?.trim() === itemName && item.value?.trim()) {
        out.push(item.value);
      }
    }
  }
  return out;
}

export function findItemValue(
  groups: ProductCharGroup[] | undefined,
  itemName: string,
): string {
  return findItemValues(groups, itemName)[0] || "";
}

export function findAnyValue(
  groups: ProductCharGroup[] | undefined,
  ...itemNames: string[]
): string {
  for (const name of itemNames) {
    const value = findItemValue(groups, name);
    if (value) return value;
  }
  return "";
}

export function cleanValue(raw: string): string {
  return raw
    .replace(/^[\s•·●]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseWatts(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*Вт/gi)];
  if (!matches.length) return null;
  let max = 0;
  for (const m of matches) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max : null;
}

export function bucketWatts(watts: number, buckets: Array<{ max: number; label: string }>): string {
  for (const bucket of buckets) {
    if (watts <= bucket.max) return bucket.label;
  }
  return buckets[buckets.length - 1]?.label || `${watts} Вт`;
}

/** Replace/refresh synthetic group; keep manufacturer groups intact. */
export function applySyntheticItems(
  chars: ProductCharGroup[] | undefined,
  items: CharItem[],
  markerNames: string[],
): ProductCharGroup[] {
  const existing = chars || [];
  const markers = new Set(markerNames);
  const rest = existing.filter((g) => {
    if (g.name !== SYNTHETIC_GROUP) return true;
    return !g.items.some((i) => markers.has(i.name));
  });
  if (!items.length) return rest;
  return [{ name: SYNTHETIC_GROUP, items }, ...rest];
}

export function pushUnique(items: CharItem[], name: string, value: string | null | undefined) {
  if (!value?.trim()) return;
  items.push({ name, value: value.trim() });
}

export function pushMulti(items: CharItem[], name: string, values: string[]) {
  for (const value of values) pushUnique(items, name, value);
}

export function filtersFor(...charNames: string[]): string[] {
  return ["brand", "price", ...charNames.map((n) => `char:${n}`)];
}

export function wifiGeneration(hay: string): string | null {
  if (has(hay, "802.11ax", " wi-fi 6", "wifi 6", " ax", "/ax", "ax1500", "ax3000", "ax1800")) {
    return "AX";
  }
  if (has(hay, "802.11ac", " wi-fi 5", "wifi 5", " ac", "/ac", "ac750", "ac1200", "ac1300", "ac2200")) {
    return "AC";
  }
  if (has(hay, "802.11n", " n300", " n150", "/n ", " wi-fi 4")) return "N";
  const classMatch = hay.match(/\b(AX|AC|N)\s?\d{3,4}\b/i);
  if (classMatch) return classMatch[1].toUpperCase();
  return null;
}

export function wifiClass(hay: string): string | null {
  const m = hay.match(/\b((?:AX|AC|N)\d{3,4})\b/i);
  return m ? m[1].toUpperCase() : null;
}

export function ethernetSpeedFromText(hay: string): string | null {
  if (has(hay, "10g", "10 гбит", "10gbase")) return "10G";
  if (has(hay, "2.5g", "2,5g", "мультигигабит", "multi-gig")) return "Мультигигабит";
  if (has(hay, "1000base", "10/100/1000", "гигабит", "gigabit", "1 гбит", "1,25 гбит")) {
    return "Gigabit";
  }
  if (has(hay, "10/100", "100base", "fast ethernet")) return "Fast Ethernet";
  return null;
}

export function derivePoeClass(hay: string): string | null {
  if (has(hay, "poe++", "802.3bt", "poe ++")) return "PoE++";
  if (has(hay, "poe+", "802.3at", "poe plus")) return "PoE+";
  if (has(hay, "poe", "802.3af")) return "PoE";
  return null;
}

export function distanceBucket(text: string): string | null {
  const km = text.match(/(\d+(?:[.,]\d+)?)\s*км/i);
  if (km) {
    const n = Number(String(km[1]).replace(",", "."));
    if (n <= 0.55) return "до 550 м";
    if (n <= 2) return "до 2 км";
    if (n <= 10) return "до 10 км";
    if (n <= 20) return "до 20 км";
    if (n <= 40) return "до 40 км";
    if (n <= 80) return "до 80 км";
    return "более 80 км";
  }
  const m = text.match(/(\d+)\s*м(?![а-яa-z])/i);
  if (m) {
    const n = Number(m[1]);
    if (n <= 100) return "до 100 м";
    if (n <= 300) return "до 300 м";
    if (n <= 550) return "до 550 м";
    if (n <= 2000) return "до 2 км";
  }
  return null;
}

export function fiberMedium(hay: string): string | null {
  if (has(hay, "одномод", "single-mode", "smf", "sm ")) return "Одномод";
  if (has(hay, "многомод", "multi-mode", "mmf", "mm ")) return "Многомод";
  if (has(hay, "витая пара", "twisted", "rj-45", "rj45", "copper", "base-t")) return "Витая пара";
  if (has(hay, "dac", "direct attach")) return "DAC";
  return null;
}

export function connectorFromText(hay: string): string | null {
  if (has(hay, "qsfp")) return "QSFP";
  if (has(hay, "sfp+")) return "SFP+";
  if (/\bsfp\b/i.test(hay)) return "SFP";
  if (has(hay, "sc/apc", "sc apc")) return "SC/APC";
  if (/\bsc\b/i.test(hay) || has(hay, "разъемом sc", "разъем sc")) return "SC";
  if (has(hay, "lc")) return "LC";
  if (has(hay, "rj-45", "rj45")) return "RJ-45";
  return null;
}

export function formFactorFromText(hay: string): string | null {
  if (has(hay, "qsfp28")) return "QSFP28";
  if (has(hay, "qsfp+")) return "QSFP+";
  if (has(hay, "qsfp")) return "QSFP";
  if (has(hay, "sfp28")) return "SFP28";
  if (has(hay, "sfp+")) return "SFP+";
  if (/\bsfp\b/i.test(hay)) return "SFP";
  return null;
}

export function wdmFromText(hay: string): string | null {
  if (has(hay, "bx-u", "bxu", "tx1310", "tx: 1310")) return "BX-U";
  if (has(hay, "bx-d", "bxd", "tx1550", "tx: 1550")) return "BX-D";
  if (has(hay, "wdm", "bidirectional", "двунаправлен")) return "WDM";
  return null;
}

export function mountValues(hay: string): string[] {
  const mounts: string[] = [];
  if (has(hay, "стойк", "rack") || /19\s*[”"′']/.test(hay)) mounts.push('Стойка 19"');
  if (has(hay, "din")) mounts.push("DIN-рейка");
  if (has(hay, "потол")) mounts.push("Потолок");
  if (has(hay, "мачт")) mounts.push("Мачта");
  if (has(hay, "стен")) mounts.push("Стена");
  if (has(hay, "стол", "настоль", "desktop")) mounts.push("Стол");
  return mounts;
}
