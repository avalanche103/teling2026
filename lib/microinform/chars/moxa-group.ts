import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  filtersFor,
  has,
  pushUnique,
  type CharInput,
  type CharItem,
} from "./shared";

const SERIAL_MARKERS = ["Тип", "Порты", "Интерфейс", "Исполнение"];
const ACCESSORY_MARKERS = ["Тип"];

function portCount(hay: string, articul: string): string | null {
  const fromName =
    hay.match(/(\d+)\s*порт/i)?.[1] ||
    hay.match(/(\d+)\s*-?\s*port/i)?.[1] ||
    hay.match(/(\d+)\s*x\s*rs/i)?.[1];
  if (fromName) return fromName;
  // NPort 5110 / UPort 1250 / CP-104 → digit groups that look like port counts.
  const a = articul.toUpperCase().replace(/\s+/g, "");
  const nport = a.match(/^(?:NPORT|UPORT)[- ]?(\d)/i);
  if (nport) {
    const lead = Number(nport[1]);
    if (lead === 1) return "1";
    if (lead === 5 && /NPORT\s*5\d{2}/i.test(articul)) return "1";
  }
  const multi = a.match(/^(?:NPORT|UPORT|MGATE)\s*(\d)/i);
  if (multi) {
    const n = Number(multi[1]);
    if ([1, 2, 4, 8, 16].includes(n)) return String(n);
  }
  const cp = a.match(/^CP-?(\d{2,3})/);
  if (cp) {
    const n = Number(cp[1].slice(-2) || cp[1]);
    // CP-102 → 2, CP-104 → 4, CP-114 → 4, CP-168 → 8
    if (n === 2 || n === 4 || n === 8 || n === 16) return String(n);
    if (n >= 100) {
      const ports = Math.floor(n / 10) % 10 || n % 100;
      if ([2, 4, 8, 16].includes(ports)) return String(ports);
    }
  }
  return null;
}

function serialInterface(hay: string): string | null {
  const has232 = has(hay, "rs-232", "rs232", "rs 232");
  const has422 = has(hay, "rs-422", "rs422", "rs 422");
  const has485 = has(hay, "rs-485", "rs485", "rs 485");
  if (has232 && (has422 || has485)) return "RS-232/422/485";
  if (has422 && has485) return "RS-422/485";
  if (has232) return "RS-232";
  if (has485) return "RS-485";
  if (has422) return "RS-422";
  return null;
}

function temperatureClass(hay: string, articul: string): string | null {
  if (
    /-T\b/.test(articul.toUpperCase()) ||
    has(hay, "-40", "−40", "расширенн", "wide temperature", "wide temp")
  ) {
    return "Расширенная температура";
  }
  return "Стандарт";
}

function converterType(hay: string, articul: string, sectionTitle: string): string | null {
  const a = articul.toUpperCase();
  const sec = sectionTitle.toLowerCase();
  if (/^UPORT/i.test(a) || has(hay, "usb") || sec.includes("usb")) return "USB-Serial";
  if (/^ICF/i.test(a) || has(hay, "оптик", "fiber", "оптоволок") || sec.includes("оптик")) {
    return "Serial-оптика";
  }
  if (/^TCC/i.test(a) || has(hay, "rs-232 в rs", "повторитель", "репитер")) {
    return "RS-232↔RS-422/485";
  }
  return null;
}

function gatewayBoardType(hay: string, articul: string): string | null {
  const a = articul.toUpperCase();
  if (/^MGATE/i.test(a) || has(hay, "modbus", "profibus", "шлюз")) return "Шлюз";
  if (/^IOLOGIK/i.test(a) || has(hay, "i/o", "ввода-вывода", "di,", "do,")) return "I/O";
  if (/^(CP-|CI-)/i.test(a) || has(hay, "плат", "pcie", "pci express", "upci", "isa")) {
    return "Плата";
  }
  return null;
}

function accessoryType(hay: string, articul: string): string | null {
  const a = articul.toUpperCase();
  if (/^CBL|^CN\d/i.test(a) || has(hay, "кабел", "cable")) return "Кабель";
  if (/^WK-|^RK-|^DK/i.test(a) || has(hay, "монтаж", "креплен", "din", "rack", "стен")) {
    return "Крепёж";
  }
  if (/^M12|MINI DB|TB\b/i.test(a) || has(hay, "разъем", "разъём", "connector")) return "Разъём";
  return null;
}

function refineSerialBase(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
  withType: "converter" | "gateway" | "accessory" | null,
): ProductCharGroup[] {
  const input: CharInput = { sectionTitle, name, articul, enrichedGroups: chars };
  const hay = blobOf(input).toLowerCase();
  const items: CharItem[] = [];

  if (withType === "converter") {
    pushUnique(items, "Тип", converterType(hay, articul, sectionTitle));
  } else if (withType === "gateway") {
    pushUnique(items, "Тип", gatewayBoardType(hay, articul));
  } else if (withType === "accessory") {
    pushUnique(items, "Тип", accessoryType(hay, articul));
  }

  if (withType !== "accessory") {
    pushUnique(items, "Порты", portCount(hay, articul));
    pushUnique(items, "Интерфейс", serialInterface(hay));
    pushUnique(items, "Исполнение", temperatureClass(hay, articul));
  }

  const markers = withType === "accessory" ? ACCESSORY_MARKERS : SERIAL_MARKERS;
  return applySyntheticItems(chars, items, markers);
}

export function refineSerialEthernetCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineSerialBase(sectionTitle, name, articul, chars, null);
}

export function refineSerialConvertersCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineSerialBase(sectionTitle, name, articul, chars, "converter");
}

export function refineSerialGatewaysBoardsCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineSerialBase(sectionTitle, name, articul, chars, "gateway");
}

export function refineIndustrialAccessoriesCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return refineSerialBase(sectionTitle, name, articul, chars, "accessory");
}

export const SERIAL_ETHERNET_SELECTED_FILTERS = filtersFor(
  "Порты",
  "Интерфейс",
  "Исполнение",
);
export const SERIAL_CONVERTERS_SELECTED_FILTERS = filtersFor(
  "Тип",
  "Порты",
  "Интерфейс",
  "Исполнение",
);
export const SERIAL_GATEWAYS_BOARDS_SELECTED_FILTERS = filtersFor(
  "Тип",
  "Порты",
  "Интерфейс",
  "Исполнение",
);
export const INDUSTRIAL_ACCESSORIES_SELECTED_FILTERS = filtersFor("Тип");
