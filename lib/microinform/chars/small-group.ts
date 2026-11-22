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
  type CharInput,
  type CharItem,
} from "./shared";

const CAMERA_MARKERS = [
  "Разрешение",
  "Корпус",
  "Размещение",
  "PoE",
  "ИК-подсветка",
  "Объектив",
  "Поворот",
  "Защита",
];

const XDSL_MARKERS = ["Тип", "Стандарт DSL", "Annex", "Подключение", "Кабель", "Вывод кабеля"];

const VOIP_MARKERS = [
  "Тип",
  "FXS-порты",
  "SIP-аккаунты",
  "Ethernet",
  "PoE",
  "Дисплей",
  "Монтаж",
  "HD Voice",
];

const GPON_MARKERS = [
  "Тип",
  "PON",
  "Оптический класс",
  "Ethernet",
  "FXS",
  "Разъем PON",
  "Дальность",
  "WAN",
];

const SOFTWARE_MARKERS = [
  "Продукт",
  "Версия",
  "Лицензия",
  "Архитектура",
  "Платформа",
  "Разрядность",
  "Обнаружение",
  "Язык",
];

export function buildCameraCharItems(input: CharInput): CharItem[] {
  const hay = blobOf(input);
  const items: CharItem[] = [];
  const mp = hay.match(/(\d+)\s*мп/i);
  pushUnique(items, "Разрешение", mp ? `${mp[1]} Мп` : has(hay, "full hd") ? "2 Мп" : null);
  pushUnique(
    items,
    "Корпус",
    has(hay, "купол") ? "Купольная" : has(hay, "корпусн", "box") ? "Корпусная" : "Корпусная",
  );
  pushUnique(
    items,
    "Размещение",
    has(hay, "внешн", "уличн", "outdoor") ? "Уличное" : "Внутреннее",
  );
  pushUnique(items, "PoE", derivePoeClass(hay) ? "Да" : "Нет");
  const ir = hay.match(/ик[^\d]*(\d+)\s*м/i) || hay.match(/(\d+)\s*м[^\n]*ик/i);
  pushUnique(items, "ИК-подсветка", ir ? `${ir[1]} м` : has(hay, "ночн", "ик") ? "Да" : "Нет");
  pushUnique(
    items,
    "Объектив",
    has(hay, "вариофокальн", "varifocal", "zoom") ? "Вариофокальный" : "Фиксированный",
  );
  pushUnique(
    items,
    "Поворот",
    has(hay, "наклон", "поворот", "ptz", "pan") ? "Да" : "Нет",
  );
  pushUnique(
    items,
    "Защита",
    has(hay, "антивандаль", "vandal") ? "Антивандальная" : "Обычная",
  );
  return items;
}

export function refineCameraCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildCameraCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    CAMERA_MARKERS,
  );
}

export function buildXdslCharItems(input: CharInput): CharItem[] {
  const hay = blobOf(input);
  const items: CharItem[] = [];
  pushUnique(items, "Тип", has(hay, "сплиттер", "splitter") ? "Сплиттер" : "Модуль");
  if (has(hay, "adsl")) pushUnique(items, "Стандарт DSL", "ADSL");
  if (has(hay, "annex b")) pushUnique(items, "Annex", "Annex B");
  if (has(hay, "annex a")) pushUnique(items, "Annex", "Annex A");
  if (has(hay, "телефон")) pushUnique(items, "Подключение", "Телефонное");
  pushUnique(items, "Кабель", has(hay, "кабел") ? "В комплекте" : "Нет");
  pushUnique(
    items,
    "Вывод кабеля",
    has(hay, "vertical", "вертикальн") ? "Вертикальный" : null,
  );
  return items;
}

export function refineXdslCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildXdslCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    XDSL_MARKERS,
  );
}

export function buildVoipCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы"));
  const display = cleanValue(findAnyValue(groups, "Дисплей"));
  const phone = cleanValue(findAnyValue(groups, "Функции телефона"));
  const voice = cleanValue(findAnyValue(groups, "Голосовые функции"));
  const install = cleanValue(findAnyValue(groups, "Установка"));
  const power = cleanValue(findAnyValue(groups, "Питание"));
  const hay = `${blobOf(input)}\n${iface}\n${display}\n${phone}\n${voice}\n${install}\n${power}`;

  const items: CharItem[] = [];
  pushUnique(
    items,
    "Тип",
    has(hay, "телефон", "oph") ? "IP-телефон" : "Голосовой шлюз",
  );
  const fxs = hay.match(/(\d+)\s*fxs/i);
  pushUnique(items, "FXS-порты", fxs ? fxs[1] : has(hay, "шлюз") ? "24" : "Нет");
  const sip = hay.match(/(\d+)\s*sip/i);
  pushUnique(items, "SIP-аккаунты", sip ? sip[1] : null);
  pushUnique(
    items,
    "Ethernet",
    has(hay, "1000base", "гигабит") ? "Gigabit" : ethernetSpeedFromText(hay) || "Fast Ethernet",
  );
  pushUnique(items, "PoE", derivePoeClass(hay) || "Нет");
  pushUnique(
    items,
    "Дисплей",
    has(display || hay, "4.3", "4,3", '4.3"', "цветн") ? 'Цветной 4,3"' : has(hay, "телефон") ? "Есть" : "Нет",
  );
  pushMulti(items, "Монтаж", mountValues(hay).length ? mountValues(hay) : ["Стол"]);
  pushUnique(items, "HD Voice", has(hay, "hd voice", "hd-voice") ? "Да" : "Нет");
  return items;
}

export function refineVoipCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildVoipCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    VOIP_MARKERS,
  );
}

export function buildGponCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const iface = cleanValue(findAnyValue(groups, "Интерфейсы"));
  const gpon = cleanValue(findAnyValue(groups, "Характеристики GPON"));
  const wan = cleanValue(findAnyValue(groups, "Типы подключения WAN"));
  const hay = `${blobOf(input)}\n${iface}\n${gpon}\n${wan}`;

  const items: CharItem[] = [];
  pushUnique(
    items,
    "Тип",
    has(hay, "голос", "voip", "fxs") ? "Голосовой ONT" : "ONT",
  );
  pushUnique(items, "PON", "GPON");
  pushUnique(items, "Оптический класс", has(hay, "class b+", "класс b+", "b+") ? "B+" : null);
  pushUnique(
    items,
    "Ethernet",
    has(hay, "10/100base") && has(hay, "1000")
      ? "Gigabit+Fast Ethernet"
      : has(hay, "1000")
        ? "Gigabit"
        : ethernetSpeedFromText(hay),
  );
  pushUnique(items, "FXS", has(hay, "fxs") ? "1" : "Нет");
  pushUnique(items, "Разъем PON", has(hay, "sc/apc", "sc apc") ? "SC/APC" : "SC");
  pushUnique(items, "Дальность", has(hay, "20 км", "20km") ? "до 20 км" : null);
  if (has(wan || hay, "pppoe")) pushUnique(items, "WAN", "PPPoE");
  if (has(wan || hay, "статическ")) pushUnique(items, "WAN", "Статический IP");
  if (has(wan || hay, "динамическ", "dhcp")) pushUnique(items, "WAN", "DHCP");
  return items;
}

export function refineGponCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildGponCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    GPON_MARKERS,
  );
}

export function buildSoftwareCharItems(input: CharInput): CharItem[] {
  const groups = input.enrichedGroups;
  const arch = cleanValue(findAnyValue(groups, "Архитектура"));
  const langs = cleanValue(findAnyValue(groups, "Поддерживаемые языки"));
  const discovery = cleanValue(findAnyValue(groups, "Обнаружение устройств"));
  const os = cleanValue(findAnyValue(groups, "Операционная система"));
  const hay = `${blobOf(input)}\n${arch}\n${langs}\n${discovery}\n${os}`;

  const items: CharItem[] = [];
  pushUnique(
    items,
    "Продукт",
    has(hay, "d-view", "dv-700") ? "D-View" : has(hay, "лицензи") ? "Лицензия ПО" : null,
  );
  pushUnique(items, "Версия", has(hay, "d-view 7", "dv-700", " view 7") ? "7" : null);
  const nodes = hay.match(/(\d+)\s*узл/i);
  pushUnique(
    items,
    "Лицензия",
    nodes ? `${nodes[1]} узлов` : has(hay, "обновлен") ? "Обновление ПО" : has(hay, "лицензи") ? "Лицензия" : null,
  );
  pushUnique(items, "Архитектура", has(arch || hay, "клиент-сервер") ? "Клиент-сервер" : null);
  if (has(os || hay, "windows server")) pushUnique(items, "Платформа", "Windows Server");
  else if (has(os || hay, "windows")) pushUnique(items, "Платформа", "Windows");
  pushUnique(items, "Разрядность", has(hay, "64") ? "64-бит" : null);
  if (has(discovery || hay, "snmp")) pushUnique(items, "Обнаружение", "SNMP");
  if (has(discovery || hay, "ipv4")) pushUnique(items, "Обнаружение", "IPv4");
  if (has(discovery || hay, "lldp")) pushUnique(items, "Обнаружение", "LLDP");
  if (has(langs || hay, "английск")) pushUnique(items, "Язык", "Английский");
  if (has(langs || hay, "китайск")) pushUnique(items, "Язык", "Китайский");
  return items;
}

export function refineSoftwareCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  return applySyntheticItems(
    chars,
    buildSoftwareCharItems({ sectionTitle, name, articul, enrichedGroups: chars }),
    SOFTWARE_MARKERS,
  );
}

export const CAMERA_SELECTED_FILTERS = filtersFor(...CAMERA_MARKERS);
export const XDSL_SELECTED_FILTERS = filtersFor(...XDSL_MARKERS);
export const VOIP_SELECTED_FILTERS = filtersFor(...VOIP_MARKERS);
export const GPON_SELECTED_FILTERS = filtersFor(...GPON_MARKERS);
export const SOFTWARE_SELECTED_FILTERS = filtersFor(...SOFTWARE_MARKERS);
