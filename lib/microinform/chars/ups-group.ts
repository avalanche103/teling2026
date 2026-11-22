import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  filtersFor,
  findAnyValue,
  has,
  mountValues,
  pushMulti,
  pushUnique,
  type CharInput,
  type CharItem,
} from "./shared";

const UPS_MARKERS = ["Тип", "Мощность", "Фазы", "Форм-фактор"];
const ACCESSORY_MARKERS = ["Тип", "Монтаж"];

/** Name/articul + manufacturer/SSD char values so shared sections filter both catalogs. */
function upsHay(input: CharInput): string {
  const fromChars = (input.enrichedGroups || [])
    .flatMap((g) => (g.items || []).map((i) => `${i.name || ""} ${i.value || ""}`))
    .join(" ");
  return `${blobOf(input)} ${fromChars}`;
}

function parseVa(hay: string): number | null {
  // Avoid `\b` after Cyrillic — JS word bounds ignore Cyrillic letters, so "2000 ВА/1800" failed.
  const patterns: Array<{ re: RegExp; kva: boolean }> = [
    { re: /(\d+(?:[.,]\d+)?)\s*кВА(?![A-Za-zА-Яа-яЁё])/gi, kva: true },
    { re: /(\d+(?:[.,]\d+)?)\s*kVA(?![A-Za-z])/gi, kva: true },
    { re: /(\d+(?:[.,]\d+)?)\s*ВА(?![A-Za-zА-Яа-яЁё])/gi, kva: false },
    { re: /(\d+(?:[.,]\d+)?)\s*VA(?![A-Za-z])/gi, kva: false },
  ];
  let max = 0;
  for (const { re, kva } of patterns) {
    for (const m of hay.matchAll(re)) {
      let n = Number(String(m[1]).replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      if (kva) n *= 1000;
      if (n > max) max = n;
    }
  }
  // Compact model tokens: SRTSE1000 / BVSE600 — only from name/articul-ish tokens, not SSD tables.
  if (max === 0) {
    const compact = hay.match(
      /\b(?:bvse|smtse|srtse|srvse|skat-ups|infopdu|infolcd|trx11-|pts-|rts-|rto-)[^\d]*(\d{3,5})\b/i,
    );
    if (compact) {
      const n = Number(compact[1]);
      if (n >= 400 && n <= 20000) max = n;
    }
  }
  return max > 0 ? max : null;
}

function parseVaFromChars(groups: ProductCharGroup[] | undefined): number | null {
  const raw = findAnyValue(
    groups,
    "Выход. мощность, ВА",
    "Номинальная выходная мощность (Полная), ВА",
    "Полная мощность",
    "Мощность, ВА",
    "Выходная мощность, ВА",
  );
  if (!raw) return null;
  const cleaned = raw.replace(/\*/g, "").replace(/\s+/g, " ").trim();
  const kva = cleaned.match(/(\d+(?:[.,]\d+)?)\s*кВА/i);
  if (kva) {
    const n = Number(String(kva[1]).replace(",", "."));
    return Number.isFinite(n) ? n * 1000 : null;
  }
  const va = cleaned.match(/(\d+(?:[.,]\d+)?)/);
  if (!va) return null;
  const n = Number(String(va[1]).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bucketVa(va: number): string {
  if (va <= 700) return "до 700 ВА";
  if (va <= 1500) return "701–1500 ВА";
  if (va <= 3000) return "1501–3000 ВА";
  if (va <= 6000) return "3001–6000 ВА";
  if (va <= 10000) return "6001–10000 ВА";
  return "более 10 кВА";
}

function upsTopology(hay: string): string {
  if (has(hay, "онлайн", "on-line", "online", "on line", "double conversion", "двойн", "vfi")) {
    return "Онлайн";
  }
  if (
    has(
      hay,
      "линейно-интерактив",
      "line-interactive",
      "line interactive",
      "line-interactive",
      "back-ups",
      "back ups",
      "avr",
    )
  ) {
    return "Линейно-интерактивный";
  }
  return "ИБП";
}

function upsPhases(hay: string): string {
  // Do not treat crest-factor "3:1" from SSD datasheets as 3-phase.
  if (has(hay, "3ф", "3ф-", "трёхфаз", "трехфаз", "400в", "380в")) return "3Ф";
  if (/\b3\s*[\/:]\s*[13]\b/.test(hay) && !/крест|crest|пиков/i.test(hay)) return "3Ф";
  return "1Ф";
}

function upsFormFactor(hay: string): string {
  if (
    has(
      hay,
      "стоечн",
      "rackmount",
      "rack",
      " rm ",
      "rt ",
      "1u",
      "2u",
      "3u",
      "0u",
      "5u",
    )
  ) {
    return "Стоечный";
  }
  if (
    has(
      hay,
      "напольн",
      "tower",
      "floor",
      "отдельно стоящ",
      "настоль",
    )
  ) {
    return "Напольный";
  }
  return "Универсальный";
}

export function buildUpsCharItems(input: CharInput): CharItem[] {
  const hay = upsHay(input);
  const items: CharItem[] = [];
  pushUnique(items, "Тип", upsTopology(hay));
  const va = parseVa(hay) ?? parseVaFromChars(input.enrichedGroups);
  pushUnique(items, "Мощность", va != null ? bucketVa(va) : null);
  pushUnique(items, "Фазы", upsPhases(hay));
  pushUnique(items, "Форм-фактор", upsFormFactor(hay));
  return items;
}

export function refineUpsCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildUpsCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    UPS_MARKERS,
  );
}

function batteryType(hay: string): string {
  if (has(hay, "модул", "блок", "комплект", "картридж")) return "Батарейный блок";
  return "АКБ";
}

export function buildUpsBatteryCharItems(input: CharInput): CharItem[] {
  const hay = upsHay(input);
  const items: CharItem[] = [];
  pushUnique(items, "Тип", batteryType(hay));
  const mounts = mountValues(hay);
  pushMulti(items, "Монтаж", mounts.length ? mounts : ["Универсальный"]);
  return items;
}

export function refineUpsBatteryCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildUpsBatteryCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    ACCESSORY_MARKERS,
  );
}

function accessoryType(kind: "inverter" | "bypass" | "mgmt" | "mount" | "pdu", hay: string): string {
  if (kind === "inverter") return "Инвертор";
  if (kind === "bypass") return "Байпас";
  if (kind === "pdu") {
    if (has(hay, "0u", "zero u")) return "PDU 0U";
    if (has(hay, "вертикал")) return "PDU вертикальный";
    if (has(hay, "горизонтал")) return "PDU горизонтальный";
    return "PDU";
  }
  if (kind === "mount") {
    if (has(hay, "рельс", "rail")) return "Рельсы";
    if (has(hay, "напольн", "bft")) return "Напольное крепление";
    return "Монтажный комплект";
  }
  if (has(hay, "датчик", "sensor", "netfeeler")) return "Датчик";
  if (has(hay, "snmp", "сетев", "карт")) return "SNMP-карта";
  return "Модуль управления";
}

function buildAccessoryItems(
  kind: "inverter" | "bypass" | "mgmt" | "mount" | "pdu",
  input: CharInput,
): CharItem[] {
  const hay = upsHay(input);
  const items: CharItem[] = [];
  pushUnique(items, "Тип", accessoryType(kind, hay));
  const mounts = mountValues(hay);
  if (kind === "pdu" && !mounts.length) {
    if (has(hay, "вертикал", "0u")) pushMulti(items, "Монтаж", ['Стойка 19"']);
    else if (has(hay, "горизонтал", "19")) pushMulti(items, "Монтаж", ['Стойка 19"']);
    else pushMulti(items, "Монтаж", ["Универсальный"]);
  } else {
    pushMulti(items, "Монтаж", mounts.length ? mounts : ["Универсальный"]);
  }
  return items;
}

function refineAccessory(
  kind: "inverter" | "bypass" | "mgmt" | "mount" | "pdu",
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildAccessoryItems(kind, { sectionTitle, name, articul, enrichedGroups: chars }),
    ACCESSORY_MARKERS,
  );
}

export function refineUpsInverterCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineAccessory("inverter", sectionTitle, name, articul, chars);
}

export function refineUpsBypassCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineAccessory("bypass", sectionTitle, name, articul, chars);
}

export function refineUpsMgmtCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineAccessory("mgmt", sectionTitle, name, articul, chars);
}

export function refineUpsMountCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineAccessory("mount", sectionTitle, name, articul, chars);
}

export function refinePduCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineAccessory("pdu", sectionTitle, name, articul, chars);
}

export const UPS_SELECTED_FILTERS = filtersFor(...UPS_MARKERS);
export const UPS_BATTERY_SELECTED_FILTERS = filtersFor(...ACCESSORY_MARKERS);
export const UPS_ACCESSORY_SELECTED_FILTERS = filtersFor(...ACCESSORY_MARKERS);
export const PDU_SELECTED_FILTERS = filtersFor(...ACCESSORY_MARKERS);
