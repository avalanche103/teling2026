import type { ProductCharGroup } from "@/lib/types";

const SYNTHETIC_GROUP = "Характеристики";

function has(text: string, ...needles: string[]): boolean {
  const hay = text.toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

function findItemValues(groups: ProductCharGroup[] | undefined, itemName: string): string[] {
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

function findItemValue(groups: ProductCharGroup[] | undefined, itemName: string): string {
  return findItemValues(groups, itemName)[0] || "";
}

function findItemValueInGroups(
  groups: ProductCharGroup[] | undefined,
  groupNames: string[],
  itemName: string,
): string {
  const wanted = new Set(groupNames.map((n) => n.toLowerCase()));
  for (const group of groups || []) {
    if (!wanted.has(group.name.trim().toLowerCase())) continue;
    for (const item of group.items || []) {
      if (item.name?.trim() === itemName && item.value?.trim()) return item.value;
    }
  }
  return findItemValue(groups, itemName);
}

function parsePortCount(name: string, groups?: ProductCharGroup[]): string {
  const iface =
    findItemValue(groups, "Интерфейсы") ||
    findItemValue(groups, "Порты") ||
    "";

  const fromIface =
    iface.match(/(\d+)\s*порт(?:ов|а)?\s+10\/100/i) ||
    iface.match(/(\d+)\s*порт(?:ов|а)?\s+10Base/i) ||
    iface.match(/(\d+)\s*порт(?:ов|а)?\s+(?:с\s+поддержкой\s+)?PoE/i) ||
    iface.match(/(\d+)\s*порт(?:ов|а)?\b/i);
  if (fromIface) {
    const n = Number(fromIface[1]);
    if ([5, 8, 16, 24, 48].includes(n)) return String(n);
  }

  const portMatch =
    name.match(/(\d+)\s*(?:порт|x\d|х\d)/i) ||
    name.match(/(\d+)x\d/i) ||
    name.match(/\b(\d{1,2})\s*порт/i);
  if (portMatch) {
    const n = Number(portMatch[1]);
    if ([5, 8, 16, 24, 48].includes(n)) return String(n);
    return "Другое";
  }
  const known = name.match(/\b(5|8|16|24|48)\b/);
  if (known) return known[1];
  return "Другое";
}

function deriveManagement(sectionTitle: string, name: string, articul: string): string {
  const blob = `${sectionTitle} ${name} ${articul}`;
  if (has(blob, "неуправляем", "unmanaged")) return "Неуправляемый";
  if (has(blob, "настраиваем", "конфигурируем", "easysmart", "smart")) return "Настраиваемый";
  if (has(sectionTitle, "неуправл")) return "Неуправляемый";
  if (has(sectionTitle, "настраиваем")) return "Настраиваемый";
  if (has(sectionTitle, "управляем")) return "Управляемый";
  if (
    has(blob, "l3") ||
    has(name, "управляемый") ||
    /DGS-1[2-9]|DGS-[2-9]|DES-3|DXS-|DMS-|DIS-/i.test(articul)
  ) {
    return "Управляемый";
  }
  if (
    has(name, "неуправляем") ||
    /^(DES|DGS)-10\d{2}(?!-1)/i.test(articul) ||
    /^OS[12]/i.test(articul)
  ) {
    return "Неуправляемый";
  }
  if (/DGS-1100|EasySmart|smart/i.test(blob)) return "Настраиваемый";
  return "Управляемый";
}

function deriveSpeed(sectionTitle: string, name: string, articul: string, groups?: ProductCharGroup[]): string {
  const blob = `${sectionTitle} ${name} ${articul}`;
  const iface = findItemValue(groups, "Интерфейсы") || findItemValue(groups, "Порты") || "";
  const hay = `${blob}\n${iface}`;

  let speed = "Gigabit";
  if (has(sectionTitle, "fast ethernet", "10/100мбит", "10/100") || has(blob, "100base-tx", "10/100 ")) {
    speed = "Fast Ethernet";
  }
  if (has(sectionTitle, "мультигигабит", "multi") || has(hay, "2.5g", "2,5g", "5g", "multi-gig", "multigig", "2.5base", "5base")) {
    speed = "Мультигигабит";
  }
  if (has(sectionTitle, "10g", "10гбит") || has(hay, "10gbase", "10g ", "10gbase-t", "10gbase-x")) {
    speed = "10G";
  }
  if (has(sectionTitle, "gigabit", "1000мбит", "1000") || has(blob, "1000base", "10/100/1000")) {
    if (speed === "Gigabit" || (!has(sectionTitle, "10g") && !has(sectionTitle, "мульти"))) {
      speed = "Gigabit";
    }
  }
  if (has(sectionTitle, "fast ethernet")) speed = "Fast Ethernet";
  if (has(sectionTitle, "10g")) speed = "10G";
  if (has(sectionTitle, "мультигигабит")) speed = "Мультигигабит";
  if (has(sectionTitle, "gigabit ethernet") || has(sectionTitle, "1000мбит")) speed = "Gigabit";
  return speed;
}

function derivePoe(sectionTitle: string, name: string, articul: string, groups?: ProductCharGroup[]): string {
  const blob = `${sectionTitle} ${name} ${articul}`;
  const poeStd =
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Стандарт PoE") ||
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Стандарты PoE") ||
    "";
  const poePorts =
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Порты с поддержкой PoE") ||
    "";
  const maxPort =
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Макс. мощность на порт") ||
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Макс. бюджет на порт") ||
    "";

  if (
    has(poeStd, "802.3bt", "poe++", "poe ++") ||
    has(blob, "poe++", "poe ++") ||
    has(maxPort, "60 вт", "90 вт")
  ) {
    return "PoE++";
  }

  // Name / section first — matches legacy price-list heuristics.
  if (has(name, "poe+") || has(name, "poe plus") || has(blob, "poe+", "poe plus")) return "PoE+";
  if (has(name, "poe")) return "PoE";

  if (has(poeStd, "802.3at") && !has(poeStd, "802.3af")) return "PoE+";
  if (poePorts || has(poeStd, "802.3af", "802.3at", "poe")) {
    return has(poeStd, "802.3at") && !has(poeStd, "только 802.3af") ? "PoE+" : "PoE";
  }

  let poe = "Нет";
  if (has(blob, "poe") || /p(?:\/|\b)/i.test(articul) || /mp\b/i.test(articul)) {
    if (has(articul.toLowerCase(), "poe") || /P\d|MP|\/.*P/i.test(articul)) {
      poe = has(blob, "poe+") ? "PoE+" : "PoE";
    }
  }
  return poe;
}

function deriveUplink(name: string, groups?: ProductCharGroup[]): string {
  const iface =
    findItemValue(groups, "Интерфейсы") ||
    findItemValue(groups, "Порты") ||
    "";
  const hay = `${name}\n${iface}`;
  if (has(hay, "qsfp")) return "QSFP";
  if (has(hay, "sfp+")) return "SFP+";
  if (/\bsfp\b/i.test(hay) || has(hay, "1000base-x", "combo")) return "SFP";
  return "Нет";
}

function deriveMount(sectionTitle: string, name: string, groups?: ProductCharGroup[]): string[] {
  const install = findItemValue(groups, "Установка");
  const hay = `${sectionTitle}\n${name}\n${install}`;
  const mounts: string[] = [];
  if (has(hay, "стойк", "rack") || /19\s*[”"′']/.test(hay) || /19-дюйм/i.test(hay)) {
    mounts.push("Стойка 19\"");
  }
  if (has(hay, "din")) mounts.push("DIN-рейка");
  if (has(hay, "стен")) mounts.push("Стена");
  if (has(hay, "стол", "настоль", "desktop", "настольн")) mounts.push("Стол");

  if (mounts.length) return mounts;

  if (has(sectionTitle, "промышлен") || has(name, "industrial", "промышлен")) {
    return ["DIN-рейка"];
  }
  return [];
}

function deriveCooling(groups?: ProductCharGroup[]): string | null {
  const vent = findItemValue(groups, "Система вентиляции");
  const noise = findItemValue(groups, "Уровень шума");
  if (has(vent, "пассив")) return "Без вентилятора";
  if (has(vent, "вентилятор")) return "С вентилятором";
  // Only trust 0 dB when ventilation field is absent.
  if (!vent.trim() && /^\s*•?\s*0\s*дБ\s*$/i.test(noise.trim())) return "Без вентилятора";
  return null;
}

function derivePower(groups?: ProductCharGroup[]): string | null {
  const power = `${findItemValue(groups, "Питание")}\n${findItemValue(groups, "Разъем питания")}`;
  if (!power.trim()) return null;
  const hasAc = has(power, "перемен", "100-240", "100–240", "адаптер питания");
  const hasDc =
    has(power, "постоян", "клеммн", "dc:", "dc ") ||
    /\bdc\b/i.test(power) ||
    has(power, "48-55", "12-48", "12–48", "24 в");
  if (hasAc && hasDc) return "AC+DC";
  if (hasDc && !hasAc) return "DC";
  if (hasAc) return "AC";
  return null;
}

function parseWatts(text: string): number | null {
  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*Вт/gi)];
  if (!matches.length) return null;
  let max = 0;
  for (const m of matches) {
    const n = Number(String(m[1]).replace(",", "."));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max > 0 ? max : null;
}

function derivePoeBudget(poe: string, groups?: ProductCharGroup[]): string | null {
  if (poe === "Нет") return null;
  const budget =
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Бюджет мощности PoE") ||
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Максимальный бюджет мощности PoE") ||
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Номинальный бюджет мощности PoE") ||
    findItemValueInGroups(groups, ["PoE", "Параметры PoE", "Мощность PoE"], "Бюджет PoE") ||
    "";
  if (!budget) return null;
  const watts = parseWatts(budget);
  if (watts == null) return null;
  if (watts <= 60) return "до 60 Вт";
  if (watts <= 120) return "61–120 Вт";
  if (watts <= 250) return "121–250 Вт";
  if (watts <= 370) return "251–370 Вт";
  return "более 370 Вт";
}

export type SwitchCharInput = {
  sectionTitle: string;
  name: string;
  articul: string;
  enrichedGroups?: ProductCharGroup[];
};

/** Build the synthetic filter group for switches. */
export function buildSwitchChars(
  sectionTitle: string,
  name: string,
  articul: string,
  enrichedGroups?: ProductCharGroup[],
): ProductCharGroup[] {
  return [
    {
      name: SYNTHETIC_GROUP,
      items: buildSwitchCharItems({ sectionTitle, name, articul, enrichedGroups }),
    },
  ];
}

export function buildSwitchCharItems(input: SwitchCharInput): Array<{ name: string; value: string }> {
  const { sectionTitle, name, articul, enrichedGroups } = input;
  const management = deriveManagement(sectionTitle, name, articul);
  const speed = deriveSpeed(sectionTitle, name, articul, enrichedGroups);
  const poe = derivePoe(sectionTitle, name, articul, enrichedGroups);
  const industrial =
    has(sectionTitle, "промышлен") || has(`${name} ${articul}`, "industrial", "промышлен")
      ? "Промышленный"
      : "Обычный";
  const ports = parsePortCount(name, enrichedGroups);
  const uplink = deriveUplink(name, enrichedGroups);
  const mounts = deriveMount(sectionTitle, name, enrichedGroups);
  const cooling = deriveCooling(enrichedGroups);
  const power = derivePower(enrichedGroups);
  const poeBudget = derivePoeBudget(poe, enrichedGroups);

  const items: Array<{ name: string; value: string }> = [
    { name: "Управление", value: management },
    { name: "Скорость", value: speed },
    { name: "PoE", value: poe },
    { name: "Исполнение", value: industrial },
    { name: "Порты", value: ports },
    { name: "Uplink", value: uplink },
  ];

  for (const mount of mounts) {
    items.push({ name: "Монтаж", value: mount });
  }
  if (cooling) items.push({ name: "Охлаждение", value: cooling });
  if (power) items.push({ name: "Питание", value: power });
  if (poeBudget) items.push({ name: "Бюджет PoE", value: poeBudget });

  return items;
}

function isGenericCatalogSection(sectionTitle: string): boolean {
  const t = sectionTitle.trim().toLowerCase();
  if (!t || t === "коммутаторы") return true;
  // Detailed price-list titles mention speed / management / PoE / industrial.
  return !(
    has(t, "неуправл", "управл", "настраиваем", "smart", "poe", "промышлен", "industrial") ||
    has(t, "gigabit", "fast ethernet", "10g", "мультигигабит", "1000", "10/100")
  );
}

function prevSyntheticValues(chars: ProductCharGroup[] | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const group = (chars || []).find(
    (g) =>
      g.name === SYNTHETIC_GROUP &&
      g.items.some((i) => i.name === "Управление" || i.name === "PoE"),
  );
  for (const item of group?.items || []) {
    const key = item.name?.trim();
    const value = item.value?.trim();
    if (!key || !value) continue;
    const list = map.get(key) || [];
    list.push(value);
    map.set(key, list);
  }
  return map;
}

/**
 * Replace/refresh the synthetic Характеристики group using enriched manufacturer
 * groups when available; keep all other groups intact.
 *
 * When the catalog section title is generic («Коммутаторы»), keep previously
 * computed Управление/Скорость/Исполнение from price-list sync so we do not
 * regress filters after enrich.
 */
export function refineSwitchCharGroups(
  sectionTitle: string,
  name: string,
  articul: string,
  chars: ProductCharGroup[] | undefined,
): ProductCharGroup[] {
  const existing = chars || [];
  const previous = prevSyntheticValues(existing);
  const computed = buildSwitchCharItems({
    sectionTitle,
    name,
    articul,
    enrichedGroups: existing,
  });
  const generic = isGenericCatalogSection(sectionTitle);

  const pick = (field: string, computedValue: string): string => {
    const prev = previous.get(field)?.[0];
    if (!generic || !prev) return computedValue;
    return prev;
  };

  const items: Array<{ name: string; value: string }> = [];
  const computedByName = new Map<string, string[]>();
  for (const item of computed) {
    const list = computedByName.get(item.name) || [];
    list.push(item.value);
    computedByName.set(item.name, list);
  }

  const management = pick("Управление", computedByName.get("Управление")?.[0] || "Управляемый");
  const speed = pick("Скорость", computedByName.get("Скорость")?.[0] || "Gigabit");
  let poe = computedByName.get("PoE")?.[0] || "Нет";
  // Allow enrich to upgrade to PoE++ only; otherwise keep prior PoE class on generic section.
  if (generic && previous.get("PoE")?.[0]) {
    const prevPoe = previous.get("PoE")![0];
    if (poe === "PoE++") {
      /* keep upgrade */
    } else {
      poe = prevPoe;
    }
  }
  const industrial = pick("Исполнение", computedByName.get("Исполнение")?.[0] || "Обычный");

  let ports = computedByName.get("Порты")?.[0] || "Другое";
  const prevPorts = previous.get("Порты")?.[0];
  if (ports === "Другое" && prevPorts && prevPorts !== "Другое") ports = prevPorts;
  if (generic && prevPorts && prevPorts !== "Другое" && ports === "Другое") ports = prevPorts;

  items.push(
    { name: "Управление", value: management },
    { name: "Скорость", value: speed },
    { name: "PoE", value: poe },
    { name: "Исполнение", value: industrial },
    { name: "Порты", value: ports },
  );

  for (const field of ["Uplink", "Охлаждение", "Питание", "Бюджет PoE"] as const) {
    const values = computedByName.get(field) || [];
    for (const value of values) items.push({ name: field, value });
  }
  for (const value of computedByName.get("Монтаж") || []) {
    items.push({ name: "Монтаж", value });
  }

  const rest = existing.filter((g) => {
    if (g.name !== SYNTHETIC_GROUP) return true;
    return !g.items.some(
      (i) => i.name === "Управление" || i.name === "PoE" || i.name === "Uplink",
    );
  });

  return [{ name: SYNTHETIC_GROUP, items }, ...rest];
}

/** True when product looks like a switch we manage filters for. */
export function isSwitchProduct(product: {
  section_id?: number;
  section_name?: string;
  metadata?: { type?: string };
}): boolean {
  if (product.section_id === 633) return true;
  if (product.metadata?.type === "Коммутатор") return true;
  if ((product.section_name || "").toLowerCase().includes("коммутатор")) return true;
  return false;
}

export const SWITCH_SELECTED_FILTERS = [
  "brand",
  "price",
  "char:Управление",
  "char:Скорость",
  "char:PoE",
  "char:Бюджет PoE",
  "char:Исполнение",
  "char:Порты",
  "char:Uplink",
  "char:Монтаж",
  "char:Охлаждение",
  "char:Питание",
];
