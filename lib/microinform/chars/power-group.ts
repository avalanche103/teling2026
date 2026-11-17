import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  bucketWatts,
  cleanValue,
  derivePoeClass,
  ethernetSpeedFromText,
  filtersFor,
  findAnyValue,
  has,
  mountValues,
  parseWatts,
  pushMulti,
  pushUnique,
  type CharInput,
  type CharItem,
} from "./shared";

const POE_MARKERS = [
  "Тип",
  "Скорость",
  "Стандарт PoE",
  "Выходы PoE",
  "Мощность",
  "Питание",
  "Монтаж",
  "Исполнение",
];

const PSU_MARKERS = [
  "Тип",
  "Вход",
  "Мощность",
  "Выход",
  "Монтаж",
  "Исполнение",
  "PoE",
  "Назначение",
];

function poeDeviceType(hay: string): string {
  if (has(hay, "инжектор", "injector")) return "Инжектор";
  if (has(hay, "повтор", "repeater")) return "Повторитель";
  if (has(hay, "удлинитель", "extender")) return "Удлинитель";
  if (has(hay, "сплиттер", "splitter")) return "Сплиттер";
  return "Адаптер";
}

function powerWattsLabel(hay: string): string | null {
  const watts = parseWatts(hay);
  if (watts == null) {
    const bare = hay.match(/\b(30|60|75|90|140|180|240|589)\s*w\b/i);
    if (!bare) return null;
    return `${bare[1]} Вт`;
  }
  return bucketWatts(watts, [
    { max: 30, label: "до 30 Вт" },
    { max: 60, label: "31–60 Вт" },
    { max: 90, label: "61–90 Вт" },
    { max: 180, label: "91–180 Вт" },
    { max: 370, label: "181–370 Вт" },
    { max: 9999, label: "более 370 Вт" },
  ]);
}

export function buildPoeCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const ports = cleanValue(findAnyValue(groups, "Порты", "Интерфейсы"));
  const standards = cleanValue(findAnyValue(groups, "Стандарты", "Стандарты и функции"));
  const outPower = cleanValue(findAnyValue(groups, "Выходная мощность PoE", "Выходная мощность"));
  const power = cleanValue(findAnyValue(groups, "Питание"));
  const install = cleanValue(findAnyValue(groups, "Установка"));
  const hay = `${blobOf(input)}\n${ports}\n${standards}\n${outPower}\n${power}\n${install}`;

  const items: CharItem[] = [];
  pushUnique(items, "Тип", poeDeviceType(hay));
  pushUnique(items, "Скорость", ethernetSpeedFromText(hay) || "Gigabit");
  pushUnique(items, "Стандарт PoE", derivePoeClass(hay) || "PoE");
  const outs = hay.match(/(\d+)\s*порт/i);
  pushUnique(
    items,
    "Выходы PoE",
    has(hay, "2 порт") || has(hay, "двумя порт") || /2\s*порт/i.test(ports)
      ? "2"
      : outs
        ? outs[1]
        : "1",
  );
  pushUnique(items, "Мощность", powerWattsLabel(`${outPower} ${hay}`));
  pushUnique(
    items,
    "Питание",
    has(hay, "от poe", "poe in", "питание от") && !has(hay, "адаптер питания", "100-240")
      ? "От PoE"
      : "AC",
  );
  pushMulti(items, "Монтаж", mountValues(hay));
  pushUnique(
    items,
    "Исполнение",
    has(hay, "уличн", "outdoor", "ip67", "ip65") ? "Уличное" : "Обычное",
  );
  return items;
}

export function refinePoeCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildPoeCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    POE_MARKERS,
  );
}

function psuType(hay: string): string {
  if (has(hay, "шасси", "chassis")) return "Шасси";
  if (has(hay, "кабел")) return "Кабель";
  if (has(hay, "резерв", "redundant", "rps")) return "Резервный источник";
  return "Источник";
}

function outputVoltage(hay: string): string | null {
  if (has(hay, "48 в", "48v", "48 в постоянного", "57 в")) return "48 В";
  if (has(hay, "12 в", "12v")) return "12 В";
  if (has(hay, "5 в", "5v")) return "5 В";
  return null;
}

export function buildPowerSupplyCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const outPower = cleanValue(findAnyValue(groups, "Выходная мощность"));
  const inRange = cleanValue(findAnyValue(groups, "Диапазон входных напряжений", "Питание"));
  const outVolt = cleanValue(findAnyValue(groups, "Выходное напряжение"));
  const install = cleanValue(findAnyValue(groups, "Установка"));
  const switches = cleanValue(findAnyValue(groups, "Коммутаторы"));
  const hay = `${blobOf(input)}\n${outPower}\n${inRange}\n${outVolt}\n${install}\n${switches}`;

  const items: CharItem[] = [];
  pushUnique(items, "Тип", psuType(hay));
  pushUnique(
    items,
    "Вход",
    has(hay, "постоян", "dc ") || /\bdc\b/i.test(hay)
      ? has(hay, "перемен", "100-240", "ac")
        ? "AC/DC"
        : "DC"
      : "AC",
  );
  const watts = parseWatts(`${outPower} ${hay}`);
  pushUnique(
    items,
    "Мощность",
    watts != null
      ? bucketWatts(watts, [
          { max: 75, label: "до 75 Вт" },
          { max: 140, label: "76–140 Вт" },
          { max: 180, label: "141–180 Вт" },
          { max: 240, label: "181–240 Вт" },
          { max: 600, label: "241–600 Вт" },
          { max: 9999, label: "более 600 Вт" },
        ])
      : null,
  );
  pushUnique(items, "Выход", outputVoltage(`${outVolt} ${hay}`));
  const mounts = mountValues(hay);
  if (has(hay, "внешн") && !mounts.length) mounts.push("Внешний");
  if (has(hay, "шасси") && !mounts.length) mounts.push("Шасси");
  pushMulti(items, "Монтаж", mounts);
  pushUnique(
    items,
    "Исполнение",
    has(hay, "промышлен", "industrial") ? "Промышленное" : "Обычное",
  );
  pushUnique(items, "PoE", derivePoeClass(hay) ? "Да" : "Нет");
  pushUnique(
    items,
    "Назначение",
    switches || has(hay, "коммутатор") ? "Коммутаторы" : "Универсальное",
  );
  return items;
}

export function refinePowerSupplyCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildPowerSupplyCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    PSU_MARKERS,
  );
}

export const POE_SELECTED_FILTERS = filtersFor(...POE_MARKERS);
export const POWER_SUPPLY_SELECTED_FILTERS = filtersFor(...PSU_MARKERS);
