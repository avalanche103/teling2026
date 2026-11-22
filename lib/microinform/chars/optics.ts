import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  cleanValue,
  connectorFromText,
  distanceBucket,
  ethernetSpeedFromText,
  fiberMedium,
  filtersFor,
  findAnyValue,
  formFactorFromText,
  has,
  pushUnique,
  wdmFromText,
  type CharInput,
  type CharItem,
} from "./shared";

const MODULE_MARKERS = [
  "Тип",
  "Форм-фактор",
  "Скорость",
  "Среда",
  "Разъем",
  "Дальность",
  "WDM",
  "Исполнение",
];

const DAC_MARKERS = [
  "Тип",
  "Форм-фактор",
  "Скорость",
  "Разъем",
  "Дальность",
  "Исполнение",
];

const MEDIA_MARKERS = [
  "Тип",
  "Скорость",
  "Оптика",
  "Волокно",
  "WDM",
  "Дальность",
  "Слоты",
];

function isDacHay(hay: string, articul = ""): boolean {
  const a = articul.toUpperCase().replace(/\/.*$/, "");
  if (/^DEM-CB/.test(a) || /^OFM-CB/.test(a)) return true;
  return has(
    hay,
    "dac",
    "twinax",
    "direct attach",
    "прямого подключ",
    "stacking cable",
  );
}

function moduleSpeed(hay: string): string | null {
  // Prefer explicit rate tokens; avoid matching "25" inside "1,25 Гбит/с".
  if (/\b100\s*g(?:bit|бит)?\b/i.test(hay) || has(hay, "100gbase", "100 гбит")) return "100 Гбит/с";
  if (/\b40\s*g(?:bit|бит)?\b/i.test(hay) || has(hay, "40gbase", "40 гбит")) return "40 Гбит/с";
  if (/\b25\s*g(?:bit|бит)?\b/i.test(hay) || has(hay, "25gbase", "25 гбит")) {
    if (!/1[.,]25/.test(hay)) return "25 Гбит/с";
  }
  if (/\b10\s*g(?:bit|бит)?\b/i.test(hay) || has(hay, "10gbase", "10 гбит", "10,3")) return "10 Гбит/с";
  if (has(hay, "2.5g", "2,5g", "2,5 гбит")) return "2,5 Гбит/с";
  if (has(hay, "1,25", "1.25", "1000base", "1 гбит", "гигабит", "1,25 гбит")) return "1 Гбит/с";
  if (has(hay, "100base", "100 мбит", "fast ethernet", "155 мбит")) return "100 Мбит/с";
  return null;
}

export function buildModuleCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const formFactorRaw = cleanValue(findAnyValue(groups, "Тип форм-фактора"));
  const speedRaw = cleanValue(findAnyValue(groups, "Скорость передачи данных"));
  const fiberRaw = cleanValue(
    findAnyValue(groups, "Поддержка оптоволоконного кабеля", "Тип кабеля"),
  );
  const connectorRaw = cleanValue(findAnyValue(groups, "Разъем"));
  const distanceRaw = cleanValue(findAnyValue(groups, "Расстояние передачи данных"));
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы"));
  const hay = `${blobOf(input)}\n${formFactorRaw}\n${speedRaw}\n${fiberRaw}\n${connectorRaw}\n${distanceRaw}\n${iface}`;

  const items: CharItem[] = [];
  const dac = isDacHay(hay, input.articul);
  pushUnique(
    items,
    "Тип",
    dac
      ? "DAC-кабель"
      : has(hay, "кабел") && has(hay, "sfp", "qsfp")
        ? "Кабель"
        : has(hay, "кабел") && !has(hay, "трансивер", "sfp", "qsfp")
          ? "Кабель"
          : "Трансивер",
  );
  pushUnique(items, "Форм-фактор", formFactorFromText(hay) || formFactorRaw.replace(/^•\s*/, "") || null);
  pushUnique(items, "Скорость", moduleSpeed(hay) || ethernetSpeedFromText(hay));
  pushUnique(items, "Среда", dac ? "Медь" : fiberMedium(hay));
  const connector =
    has(connectorRaw, "lc")
      ? "LC"
      : has(connectorRaw, "sc/apc", "sc apc")
        ? "SC/APC"
        : has(connectorRaw, "sc")
          ? "SC"
          : has(connectorRaw, "rj-45", "rj45")
            ? "RJ-45"
            : dac
              ? "DAC"
              : connectorFromText(`${connectorRaw} ${iface} ${input.name}`);
  pushUnique(items, "Разъем", connector);
  pushUnique(items, "Дальность", distanceBucket(`${distanceRaw} ${hay}`));
  const wdm = wdmFromText(hay);
  pushUnique(items, "WDM", wdm || "Нет");
  pushUnique(
    items,
    "Исполнение",
    has(hay, "промышлен", "industrial", "i-temp", "ind.") ? "Промышленное" : "Обычное",
  );
  return items;
}

export function buildDacCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const formFactorRaw = cleanValue(findAnyValue(groups, "Тип форм-фактора"));
  const speedRaw = cleanValue(findAnyValue(groups, "Скорость передачи данных"));
  const distanceRaw = cleanValue(findAnyValue(groups, "Расстояние передачи данных"));
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы"));
  const hay = `${blobOf(input)}\n${formFactorRaw}\n${speedRaw}\n${distanceRaw}\n${iface}`;

  const items: CharItem[] = [];
  pushUnique(items, "Тип", "DAC-кабель");
  pushUnique(
    items,
    "Форм-фактор",
    formFactorFromText(hay) ||
      (has(hay, "qsfp") ? "QSFP+" : has(hay, "sfp+") ? "SFP+" : has(hay, "sfp") ? "SFP" : null) ||
      formFactorRaw.replace(/^•\s*/, "") ||
      null,
  );
  pushUnique(items, "Скорость", moduleSpeed(hay) || ethernetSpeedFromText(hay) || "10 Гбит/с");
  pushUnique(items, "Разъем", "DAC");
  pushUnique(items, "Дальность", dacLengthBucket(`${distanceRaw} ${hay}`) || distanceBucket(`${distanceRaw} ${hay}`));
  pushUnique(
    items,
    "Исполнение",
    has(hay, "промышлен", "industrial", "i-temp", "ind.") ? "Промышленное" : "Обычное",
  );
  return items;
}

/** DAC lengths are usually short metres: 1m, 3 м, (7M), DEM-CB300S → 3 m. */
function dacLengthBucket(text: string): string | null {
  const fromName = text.match(/(\d+(?:[.,]\d+)?)\s*(?:м|m)(?![а-яa-z])/i);
  if (fromName) {
    const n = Number(String(fromName[1]).replace(",", "."));
    if (n > 0 && n <= 100) {
      if (n <= 1) return "1 м";
      if (n <= 2) return "2 м";
      if (n <= 3) return "3 м";
      if (n <= 5) return "5 м";
      if (n <= 7) return "7 м";
      return "до 100 м";
    }
  }
  const fromSku = text.match(/(?:DEM-CB|OFM-CB)(\d{2,3})/i);
  if (fromSku) {
    const code = Number(fromSku[1]);
    // D-Link/Origo: CB100≈1m, CB300≈3m, CB700≈7m.
    if (code === 100 || code === 101) return "1 м";
    if (code === 300) return "3 м";
    if (code === 500) return "5 м";
    if (code === 700) return "7 м";
  }
  return null;
}

export function refineModuleCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildModuleCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    MODULE_MARKERS,
  );
}

export function refineDacCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildDacCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    DAC_MARKERS,
  );
}

export function buildMediaConverterCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const ports = cleanValue(findAnyValue(groups, "Порты", "Интерфейсы"));
  const fiber = cleanValue(findAnyValue(groups, "Тип оптического кабеля", "Тип кабеля"));
  const distance = cleanValue(
    findAnyValue(groups, "Длина оптического кабеля", "Расстояние передачи данных"),
  );
  const standards = cleanValue(findAnyValue(groups, "Стандарты и функции", "Стандарты"));
  const hay = `${blobOf(input)}\n${ports}\n${fiber}\n${distance}\n${standards}`;

  const items: CharItem[] = [];
  pushUnique(
    items,
    "Тип",
    has(hay, "шасси", "chassis") ? "Шасси" : "Медиаконвертер",
  );
  pushUnique(
    items,
    "Скорость",
    has(hay, "10g")
      ? "10G"
      : has(hay, "1000", "гигабит", "gigabit")
        ? "Gigabit"
        : has(hay, "10/100", "100base", "fast")
          ? "Fast Ethernet"
          : ethernetSpeedFromText(hay),
  );
  pushUnique(
    items,
    "Оптика",
    has(hay, "sfp+")
      ? "SFP+"
      : has(hay, "sfp")
        ? "SFP"
        : has(hay, "sc")
          ? "SC"
          : connectorFromText(hay),
  );
  pushUnique(items, "Волокно", fiberMedium(hay));
  pushUnique(items, "WDM", wdmFromText(hay) || "Нет");
  pushUnique(items, "Дальность", distanceBucket(`${distance} ${hay}`));
  if (has(hay, "шасси", "chassis")) {
    const slots = hay.match(/(\d+)\s*слот/i);
    pushUnique(items, "Слоты", slots ? slots[1] : "16");
  } else {
    pushUnique(items, "Слоты", "Нет");
  }
  return items;
}

export function refineMediaConverterCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildMediaConverterCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    MEDIA_MARKERS,
  );
}

export const MODULE_SELECTED_FILTERS = filtersFor(...MODULE_MARKERS);
export const DAC_SELECTED_FILTERS = filtersFor(...DAC_MARKERS);
export const MEDIA_CONVERTER_SELECTED_FILTERS = filtersFor(...MEDIA_MARKERS);
