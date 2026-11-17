import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  cleanValue,
  derivePoeClass,
  ethernetSpeedFromText,
  filtersFor,
  findAnyValue,
  has,
  mountValues,
  pushMulti,
  pushUnique,
  wifiClass,
  wifiGeneration,
  type CharInput,
  type CharItem,
} from "./shared";

const WIRELESS_MARKERS = [
  "Тип",
  "Wi-Fi",
  "Класс Wi-Fi",
  "Диапазон",
  "PoE",
  "Размещение",
  "Монтаж",
  "Антенны",
];

const ROUTER_MARKERS = [
  "Wi-Fi",
  "Класс Wi-Fi",
  "Диапазон",
  "Ethernet",
  "WAN",
  "Мобильная сеть",
  "SIM",
  "Дополнительно",
];

function wirelessType(hay: string): string {
  if (has(hay, "mesh", "covr")) return "Mesh-система";
  if (has(hay, "повтор", "repeater", "extender")) return "Повторитель";
  if (has(hay, "контроллер", "controller", "dnh-", "dnc-")) return "Контроллер";
  if (has(hay, "антенн") && has(hay, "кабел")) return "Антенный кабель";
  if (has(hay, "антенн")) return "Антенна";
  if (has(hay, "точк", "access point", "dap-", "dwl-")) return "Точка доступа";
  return "Точка доступа";
}

function bandFromText(hay: string): string | null {
  const dual = has(hay, "двухдиапазон", "2,4+5", "2.4+5", "2.4/5", "2,4/5");
  const has24 = has(hay, "2,4", "2.4");
  const has5 = has(hay, "5 ггц", "5 ghz", "5ггц") || /5\s*ггц/i.test(hay);
  if (dual || (has24 && has5)) return "2,4+5 ГГц";
  if (has5 && !has24) return "5 ГГц";
  if (has24) return "2,4 ГГц";
  return null;
}

function antennaKind(hay: string): string | null {
  if (has(hay, "кабел") && has(hay, "антенн")) return "Кабель";
  if (has(hay, "внешн")) return "Внешние";
  if (has(hay, "внутрен")) return "Внутренние";
  return null;
}

export function buildWirelessCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const standards = cleanValue(findAnyValue(groups, "Стандарты"));
  const freq = cleanValue(findAnyValue(groups, "Диапазон частот"));
  const speed = cleanValue(findAnyValue(groups, "Скорость беспроводного соединения"));
  const power = cleanValue(findAnyValue(groups, "Питание"));
  const install = cleanValue(findAnyValue(groups, "Установка"));
  const antenna = cleanValue(findAnyValue(groups, "Антенна"));
  const hay = `${blobOf(input)}\n${standards}\n${freq}\n${speed}\n${power}\n${install}\n${antenna}`;

  const items: CharItem[] = [];
  pushUnique(items, "Тип", wirelessType(hay));
  pushUnique(items, "Wi-Fi", wifiGeneration(hay));
  pushUnique(items, "Класс Wi-Fi", wifiClass(hay));
  pushUnique(items, "Диапазон", bandFromText(hay));
  pushUnique(items, "PoE", derivePoeClass(hay) || "Нет");
  pushUnique(
    items,
    "Размещение",
    has(hay, "уличн", "outdoor", "ip67", "ip68", "ip65")
      ? "Уличное"
      : has(hay, "антенн") && has(hay, "кабел")
        ? null
        : "Внутреннее",
  );
  pushMulti(items, "Монтаж", mountValues(hay));
  pushUnique(items, "Антенны", antennaKind(hay));
  return items;
}

export function refineWirelessCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildWirelessCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    WIRELESS_MARKERS,
  );
}

function wanType(hay: string): string | null {
  if (has(hay, "sfp")) return "SFP";
  if (has(hay, "мобильн", "lte", "3g", "4g", "usb-модем")) return "Мобильный";
  if (has(hay, "wan", "rj-45", "rj45", "base-t")) return "RJ-45";
  return null;
}

function mobileNet(hay: string): string | null {
  if (has(hay, "4g", "lte")) return "4G LTE";
  if (has(hay, "3g")) return "3G";
  return "Нет";
}

function simCount(hay: string): string {
  if (has(hay, "2 sim", "две sim", "dual sim", "2 сим")) return "2 SIM";
  if (has(hay, "sim")) return "1 SIM";
  return "Нет";
}

export function buildRouterCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы"));
  const wan = cleanValue(findAnyValue(groups, "Типы подключения WAN"));
  const standards = cleanValue(findAnyValue(groups, "Стандарты"));
  const speed = cleanValue(findAnyValue(groups, "Скорость беспроводного соединения"));
  const hay = `${blobOf(input)}\n${iface}\n${wan}\n${standards}\n${speed}`;

  const items: CharItem[] = [];
  pushUnique(items, "Wi-Fi", wifiGeneration(hay));
  pushUnique(items, "Класс Wi-Fi", wifiClass(hay));
  pushUnique(items, "Диапазон", bandFromText(hay));
  pushUnique(
    items,
    "Ethernet",
    has(iface || hay, "10/100/1000", "гигабит")
      ? "Gigabit"
      : has(iface || hay, "10/100")
        ? "Fast Ethernet"
        : ethernetSpeedFromText(hay),
  );
  pushUnique(items, "WAN", wanType(hay));
  pushUnique(items, "Мобильная сеть", mobileNet(hay));
  pushUnique(items, "SIM", simCount(hay));
  if (has(hay, "usb")) pushUnique(items, "Дополнительно", "USB");
  if (has(hay, "mesh", "easymesh", "covr")) pushUnique(items, "Дополнительно", "Mesh");
  if (has(hay, "mu-mimo", "mu mimo")) pushUnique(items, "Дополнительно", "MU-MIMO");
  return items;
}

export function refineRouterCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildRouterCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    ROUTER_MARKERS,
  );
}

export const WIRELESS_SELECTED_FILTERS = filtersFor(...WIRELESS_MARKERS);
export const ROUTER_SELECTED_FILTERS = filtersFor(...ROUTER_MARKERS);
