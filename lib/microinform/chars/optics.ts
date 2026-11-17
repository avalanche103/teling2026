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

const MEDIA_MARKERS = [
  "Тип",
  "Скорость",
  "Оптика",
  "Волокно",
  "WDM",
  "Дальность",
  "Слоты",
];

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
  pushUnique(
    items,
    "Тип",
    has(hay, "dac", "twinax", "кабел") && has(hay, "sfp", "qsfp", "dac")
      ? has(hay, "dac", "twinax")
        ? "DAC-кабель"
        : "Трансивер"
      : has(hay, "кабел") && !has(hay, "трансивер", "sfp", "qsfp")
        ? "Кабель"
        : "Трансивер",
  );
  pushUnique(items, "Форм-фактор", formFactorFromText(hay) || formFactorRaw.replace(/^•\s*/, "") || null);
  pushUnique(items, "Скорость", moduleSpeed(hay) || ethernetSpeedFromText(hay));
  pushUnique(items, "Среда", fiberMedium(hay));
  const connector =
    has(connectorRaw, "lc")
      ? "LC"
      : has(connectorRaw, "sc/apc", "sc apc")
        ? "SC/APC"
        : has(connectorRaw, "sc")
          ? "SC"
          : has(connectorRaw, "rj-45", "rj45")
            ? "RJ-45"
            : has(hay, "dac")
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
export const MEDIA_CONVERTER_SELECTED_FILTERS = filtersFor(...MEDIA_MARKERS);
