import type { ProductCharGroup } from "@/lib/types";

function has(text: string, ...needles: string[]): boolean {
  const hay = text.toLowerCase();
  return needles.some((n) => hay.includes(n.toLowerCase()));
}

export function buildSwitchChars(sectionTitle: string, name: string, articul: string): ProductCharGroup[] {
  const blob = `${sectionTitle} ${name} ${articul}`;

  let management = "Управляемый";
  if (has(blob, "неуправляем", "unmanaged")) management = "Неуправляемый";
  else if (has(blob, "настраиваем", "конфигурируем", "easysmart", "smart")) management = "Настраиваемый";
  else if (has(sectionTitle, "неуправл")) management = "Неуправляемый";
  else if (has(sectionTitle, "настраиваем")) management = "Настраиваемый";
  else if (has(sectionTitle, "управляем")) management = "Управляемый";
  else if (
    has(blob, "l3") ||
    has(name, "управляемый") ||
    /DGS-1[2-9]|DGS-[2-9]|DES-3|DXS-|DMS-|DIS-/i.test(articul)
  ) {
    management = "Управляемый";
  } else if (
    has(name, "неуправляем") ||
    /^(DES|DGS)-10\d{2}(?!-1)/i.test(articul) ||
    /^OS[12]/i.test(articul)
  ) {
    management = "Неуправляемый";
  } else if (/DGS-1100|EasySmart|smart/i.test(blob)) {
    management = "Настраиваемый";
  }

  let speed = "Gigabit";
  if (has(sectionTitle, "fast ethernet", "10/100мбит", "10/100") || has(blob, "100base-tx", "10/100 ")) {
    speed = "Fast Ethernet";
  }
  if (has(sectionTitle, "мультигигабит", "multi") || has(blob, "2.5g", "5g", "multi-gig", "multigig")) {
    speed = "Мультигигабит";
  }
  if (has(sectionTitle, "10g", "10гбит") || has(blob, "10gbase", "10g ")) {
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

  let poe = "Нет";
  if (has(blob, "poe+", "poe plus")) poe = "PoE+";
  else if (has(blob, "poe") || /p(?:\/|\b)/i.test(articul) || /mp\b/i.test(articul)) {
    if (has(name, "poe") || has(articul.toLowerCase(), "poe") || /P\d|MP|\/.*P/i.test(articul)) {
      poe = has(blob, "poe+") ? "PoE+" : "PoE";
    }
  }
  if (has(name, "poe+") || has(name, "poe plus")) poe = "PoE+";
  else if (has(name, "poe")) poe = "PoE";

  const industrial =
    has(sectionTitle, "промышлен") || has(blob, "industrial", "промышлен")
      ? "Промышленный"
      : "Обычный";

  let ports = "Другое";
  const portMatch =
    name.match(/(\d+)\s*(?:порт|x\d|х\d)/i) ||
    name.match(/(\d+)x\d/i) ||
    name.match(/\b(\d{1,2})\s*порт/i);
  if (portMatch) {
    const n = Number(portMatch[1]);
    if ([5, 8, 16, 24, 48].includes(n)) ports = String(n);
    else ports = "Другое";
  } else {
    const known = name.match(/\b(5|8|16|24|48)\b/);
    if (known) ports = known[1];
  }

  return [
    {
      name: "Характеристики",
      items: [
        { name: "Управление", value: management },
        { name: "Скорость", value: speed },
        { name: "PoE", value: poe },
        { name: "Исполнение", value: industrial },
        { name: "Порты", value: ports },
      ],
    },
  ];
}

export const SWITCH_SELECTED_FILTERS = [
  "brand",
  "price",
  "char:Управление",
  "char:Скорость",
  "char:PoE",
  "char:Исполнение",
  "char:Порты",
];
