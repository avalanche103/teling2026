import type { ProductCharGroup } from "@/lib/types";
import {
  applySyntheticItems,
  blobOf,
  cleanValue,
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

const KVM_MARKERS = [
  "Тип",
  "ПК",
  "Видео",
  "Периферия",
  "Разрешение",
  "Монтаж",
  "Кабель",
  "Длина",
];

const ADAPTER_MARKERS = [
  "Тип",
  "Подключение",
  "Скорость",
  "Порт",
  "Порты",
  "Wi-Fi",
  "Антенны",
  "ОС",
];

const USB_MARKERS = [
  "Тип",
  "USB",
  "Хост",
  "USB-порты",
  "Ethernet",
  "Видео",
  "Power Delivery",
  "Картридер",
];

export function buildKvmCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const pcs = cleanValue(findAnyValue(groups, "Количество подключаемых ПК"));
  const length = cleanValue(findAnyValue(groups, "Длина"));
  const resolution = cleanValue(findAnyValue(groups, "Разрешение"));
  const install = cleanValue(findAnyValue(groups, "Установка"));
  const video = cleanValue(findAnyValue(groups, "Видеоразъем", "Видео"));
  const keyboard = cleanValue(findAnyValue(groups, "Клавиатура", "Мышь"));
  const hay = `${blobOf(input)}\n${pcs}\n${length}\n${resolution}\n${install}\n${video}\n${keyboard}`;

  const items: CharItem[] = [];
  const isCable = has(hay, "кабел") || /^DKVM-(CB|IPCB)/i.test(input.articul);
  pushUnique(items, "Тип", isCable ? "KVM-кабель" : "KVM-переключатель");

  const pcMatch = hay.match(/(\d+)\s*(?:-?\s*)?(?:порт|пк|компьют)/i) || pcs.match(/(\d+)/);
  if (pcMatch) pushUnique(items, "ПК", pcMatch[1]);
  else if (/DKVM-16/i.test(input.articul)) pushUnique(items, "ПК", "16");
  else if (/DKVM-4/i.test(input.articul)) pushUnique(items, "ПК", "4");
  else if (/DKVM-2/i.test(input.articul)) pushUnique(items, "ПК", "2");

  pushUnique(
    items,
    "Видео",
    has(hay, "hdmi") ? "HDMI" : has(hay, "vga", "hdb") ? "VGA" : null,
  );
  pushUnique(
    items,
    "Периферия",
    has(hay, "usb") ? "USB" : has(hay, "ps/2", "ps2", "mini-din") ? "PS/2" : null,
  );
  pushUnique(
    items,
    "Разрешение",
    has(hay, "4k", "3840")
      ? "4K"
      : has(hay, "2048")
        ? "2048×1536"
        : has(hay, "full hd", "1920", "1080")
          ? "Full HD"
          : null,
  );
  pushMulti(items, "Монтаж", mountValues(hay));
  pushUnique(items, "Кабель", isCable || has(hay, "встроен") ? (isCable ? "Отдельный" : "Встроенный") : "Отдельный");
  const len = length.match(/(\d+(?:[.,]\d+)?)\s*м/i) || hay.match(/(\d+(?:[.,]\d+)?)\s*м/i);
  if (isCable && len) {
    const n = Number(String(len[1]).replace(",", "."));
    pushUnique(
      items,
      "Длина",
      n <= 1.8 ? "1,8 м" : n <= 3 ? "3 м" : n <= 5 ? "5 м" : `${n} м`,
    );
  }
  return items;
}

export function refineKvmCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildKvmCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    KVM_MARKERS,
  );
}

export function buildAdapterCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const iface = cleanValue(
    findAnyValue(groups, "Интерфейс подключения", "Интерфейс", "Интерфейсы", "Слот установки"),
  );
  const speed = cleanValue(
    findAnyValue(groups, "Скорость передачи данных", "Скорость беспроводного соединения2", "Стандарты и функции"),
  );
  const ports = cleanValue(findAnyValue(groups, "Порты", "Интерфейсы"));
  const antenna = cleanValue(findAnyValue(groups, "Антенна"));
  const os = cleanValue(findAnyValue(groups, "Поддержка сетевых ОС", "Операционная система", "Поддержка ОС"));
  const standards = cleanValue(findAnyValue(groups, "Стандарты", "Стандарты и функции"));
  const hay = `${blobOf(input)}\n${iface}\n${speed}\n${ports}\n${antenna}\n${os}\n${standards}`;

  const items: CharItem[] = [];
  const isWifi = has(hay, "wi-fi", "wifi", "802.11", "беспровод") || /^DWA-/i.test(input.articul);
  pushUnique(items, "Тип", isWifi ? "Wi-Fi" : "Ethernet");
  pushUnique(
    items,
    "Подключение",
    has(hay, "pcie x8", "x8")
      ? "PCIe x8"
      : has(hay, "pcie", "pci express")
        ? "PCIe x1"
        : has(hay, "usb")
          ? "USB"
          : has(hay, "pci")
            ? "PCI"
            : null,
  );
  pushUnique(
    items,
    "Скорость",
    isWifi
      ? wifiClass(hay) || wifiGeneration(hay)
      : ethernetSpeedFromText(hay) ||
        (has(hay, "10g") ? "10G" : has(hay, "1000", "гигабит") ? "Gigabit" : "Fast Ethernet"),
  );
  pushUnique(
    items,
    "Порт",
    has(hay, "sfp+")
      ? "SFP+"
      : has(hay, "sfp")
        ? "SFP"
        : has(hay, "rj-45", "rj45", "base-t", "base-tx")
          ? "RJ-45"
          : isWifi
            ? null
            : "RJ-45",
  );
  const portCount = ports.match(/(\d+)\s*порт/i);
  pushUnique(items, "Порты", portCount ? portCount[1] : has(hay, "2 порт") ? "2" : "1");
  pushUnique(items, "Wi-Fi", isWifi ? wifiGeneration(hay) || "N" : "Нет");
  pushUnique(items, "Антенны", has(hay, "антенн") ? "Встроенные" : isWifi ? "Встроенные" : "Нет");
  if (has(os || hay, "windows")) pushUnique(items, "ОС", "Windows");
  if (has(os || hay, "linux")) pushUnique(items, "ОС", "Linux");
  if (has(os || hay, "mac")) pushUnique(items, "ОС", "macOS");
  return items;
}

export function refineAdapterCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildAdapterCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    ADAPTER_MARKERS,
  );
}

export function buildUsbCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы", "Разъем подключения к ПК"));
  const standards = cleanValue(findAnyValue(groups, "Стандарты"));
  const speed = cleanValue(findAnyValue(groups, "Скорость передачи данных"));
  const power = cleanValue(findAnyValue(groups, "Питание"));
  const hay = `${blobOf(input)}\n${iface}\n${standards}\n${speed}\n${power}`;

  const items: CharItem[] = [];
  pushUnique(
    items,
    "Тип",
    has(hay, "док")
      ? "Док-станция"
      : has(hay, "концентратор", "hub")
        ? "Концентратор"
        : has(hay, "expresscard")
          ? "ExpressCard"
          : has(hay, "адаптер", "ethernet", "сетев")
            ? "Сетевой адаптер"
            : "Концентратор",
  );
  pushUnique(
    items,
    "USB",
    has(hay, "usb 3", "usb3", "3.0", "3.1", "3.2") ? "USB 3.0" : "USB 2.0",
  );
  pushUnique(
    items,
    "Хост",
    has(hay, "expresscard")
      ? "ExpressCard"
      : has(hay, "type-c", "usb-c", "usb c")
        ? "USB-C"
        : "USB-A",
  );
  const usbPorts = [...hay.matchAll(/(\d+)\s*порт(?:а|ов)?\s+usb/gi)];
  const count = usbPorts.reduce((sum, m) => sum + Number(m[1]), 0);
  if (count > 0) pushUnique(items, "USB-порты", String(count));
  else if (has(hay, "7 порт")) pushUnique(items, "USB-порты", "7");
  else if (has(hay, "4 порт")) pushUnique(items, "USB-порты", "4");
  else if (has(hay, "3 порт")) pushUnique(items, "USB-порты", "3");
  else if (has(hay, "2 порт")) pushUnique(items, "USB-порты", "2");

  pushUnique(
    items,
    "Ethernet",
    has(hay, "ethernet", "base-t", "гигабит", "rj-45") ? "Gigabit" : "Нет",
  );
  pushUnique(items, "Видео", has(hay, "hdmi", "4k") ? "HDMI 4K" : "Нет");
  pushUnique(
    items,
    "Power Delivery",
    has(hay, "power delivery", " pd ", "100 вт") ? "PD 100 Вт" : "Нет",
  );
  pushUnique(
    items,
    "Картридер",
    has(hay, "microsd") || (has(hay, "sd") && has(hay, "карт"))
      ? "SD+microSD"
      : "Нет",
  );
  return items;
}

export function refineUsbCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildUsbCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    USB_MARKERS,
  );
}

export const KVM_SELECTED_FILTERS = filtersFor(...KVM_MARKERS);
export const ADAPTER_SELECTED_FILTERS = filtersFor(...ADAPTER_MARKERS);
export const USB_SELECTED_FILTERS = filtersFor(...USB_MARKERS);
