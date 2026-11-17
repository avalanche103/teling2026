import type { ProductRaw, SectionRaw } from "@/lib/types";
import { normalizeMicroinformArticul, stripDlinkRevisionsFromText } from "./articul";
import type { ParsedPriceRow } from "./parse-price";
import { computeMicroinformPrice } from "./pricing";
import { allocateId, allocateSku } from "./sku";
import type { MicroinformState } from "./store";
import { refineActiveNetworkChars } from "./chars";
import { classifyPriceSection, classifyProductGroup } from "./section-hints";

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function isUrlDescription(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim());
}

/** Map Microinform "склад" markers to site delivery text. */
export function stockToTimeDelivery(stock: string): string {
  const value = String(stock || "").trim();
  if (!value) return "";
  if (/^\*+$/.test(value)) return "1-2 дня";
  if (/^р$/i.test(value)) return "По запросу";
  return "";
}

export function buildMicroinformProduct(params: {
  row: ParsedPriceRow;
  section: SectionRaw;
  markupPercent: number;
  state: MicroinformState;
  occupiedSkus: Set<string>;
  previous?: ProductRaw | null;
}): ProductRaw {
  const { row, section, markupPercent, state, occupiedSkus, previous } = params;
  const articul = normalizeMicroinformArticul(row.vendor, row.articul);
  const displayName = stripDlinkRevisionsFromText(row.name);
  const sku = allocateSku(state, articul, occupiedSkus);
  occupiedSkus.add(sku);
  const id = allocateId(state, articul);
  const { price, priceWithoutVat, vatAmount } = computeMicroinformPrice(row.priceA, markupPercent);

  const group = classifyProductGroup(
    articul,
    displayName,
    row.sectionTitle,
    row.vendor,
  );
  const chars = refineActiveNetworkChars(
    group,
    row.sectionTitle,
    displayName,
    articul,
    previous?.metadata?.chars,
  );

  const descriptionFromPrice =
    row.descriptionRaw && !isUrlDescription(row.descriptionRaw)
      ? row.descriptionRaw
      : previous?.metadata?.description || "";

  const sourceUrl = row.sourceUrl || previous?.metadata?.url || "";
  const isNew = !previous;
  const pendingNew = isNew || previous?.metadata?.import_status === "new";
  const wasAbsent = previous?.metadata?.absent_from_price === true;

  let visible: boolean;
  if (pendingNew) {
    visible = false;
  } else if (wasAbsent) {
    // Returned to price after absence — restore to public catalog.
    visible = true;
  } else {
    visible = previous?.visible ?? true;
  }

  return {
    id,
    name: displayName,
    original_name: displayName,
    custom_name: previous?.custom_name ?? null,
    sku,
    supplier: "microinform",
    visible,
    section_id: section.id,
    section_name: section.name,
    price,
    calculated_price: price,
    price_override: previous?.price_override ?? null,
    price_without_vat: priceWithoutVat,
    vat_amount: vatAmount,
    currency: "Br",
    currency_code: "BYN",
    vendor: row.vendor,
    metadata: {
      articul,
      type:
        group === "switches"
          ? "Коммутатор"
          : group === "skip" || group === "mixed"
            ? previous?.metadata?.type || ""
            : previous?.metadata?.type || section.name,
      url: sourceUrl,
      ...(group !== "skip" ? { price_section: row.sectionTitle } : {}),
      sections: [section.id],
      brand: row.vendor,
      unit: "шт",
      minQty: 1,
      multiplicity: 1,
      timeDelivery: stockToTimeDelivery(row.stock),
      weight: 0,
      volume: 0,
      updated: nowStamp(),
      pictures: previous?.metadata?.pictures || [],
      video: previous?.metadata?.video || [],
      documents: previous?.metadata?.documents || [],
      zamena: [],
      analog: [],
      soputst: [],
      chars,
      description: descriptionFromPrice,
      ...(pendingNew ? { import_status: "new" as const } : {}),
    },
  };
}
