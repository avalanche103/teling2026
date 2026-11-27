import type { ProductRaw, SectionRaw } from "@/lib/types";
import { computeConceptPrice } from "./pricing";
import { allocateId, allocateSku } from "./sku";
import type { ConceptState } from "./store";

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function normalizeConceptArticul(vendor: string, articul: string): string {
  const raw = String(articul || "").replace(/\s+/g, " ").trim();
  if (/^kiwi$/i.test(vendor) && !/^kiwi/i.test(raw)) {
    return `KIWI-${raw}`;
  }
  if (/^exfo$/i.test(vendor)) {
    return raw.replace(/\s+/g, "").toUpperCase();
  }
  return raw;
}

function compactToken(value: string): string {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9А-ЯЁ]/gi, "");
}

/** True if display name already includes the articul (ignoring spaces/punctuation). */
export function nameContainsArticul(name: string, articul: string): boolean {
  const art = compactToken(articul);
  if (!art) return true;
  return compactToken(name).includes(art);
}

/** KIWI titles must include articul, e.g. "KIWI-4100 Детектор …". */
export function ensureNameContainsArticul(name: string, articul: string): string {
  const cleanName = String(name || "").replace(/\s+/g, " ").trim();
  const art = String(articul || "").replace(/\s+/g, " ").trim();
  if (!art) return cleanName;
  if (nameContainsArticul(cleanName, art)) return cleanName;
  if (!cleanName) return art;
  return `${art} ${cleanName}`;
}

export function buildConceptProduct(params: {
  vendor: "KIWI" | "EXFO";
  articul: string;
  name: string;
  usd: number | null;
  section: SectionRaw;
  sectionTitle: string;
  sourceUrl?: string;
  descriptionRaw?: string;
  usdToBynRate: number;
  markupPercent: number;
  state: ConceptState;
  occupiedSkus: Set<string>;
  previous?: ProductRaw | null;
  /** Force on-request pricing (EXFO). */
  priceOnRequest?: boolean;
}): ProductRaw {
  const {
    vendor,
    name,
    section,
    sectionTitle,
    sourceUrl,
    descriptionRaw,
    usdToBynRate,
    markupPercent,
    state,
    occupiedSkus,
    previous,
    priceOnRequest,
  } = params;

  const articul = normalizeConceptArticul(vendor, params.articul);
  const sku = allocateSku(state, `${vendor}::${articul}`, occupiedSkus);
  occupiedSkus.add(sku);
  const id = allocateId(state, `${vendor}::${articul}`);

  const displayName =
    vendor === "KIWI" ? ensureNameContainsArticul(name, articul) : name;
  const previousCustom = previous?.custom_name ?? null;
  const nextCustom =
    vendor === "KIWI" && previousCustom
      ? ensureNameContainsArticul(previousCustom, articul)
      : previousCustom;

  const onRequest = Boolean(priceOnRequest) || vendor === "EXFO" || !(params.usd && params.usd > 0);
  const priced = onRequest
    ? { price: 0, priceWithoutVat: 0, vatAmount: 0 }
    : computeConceptPrice(params.usd || 0, usdToBynRate, markupPercent);

  const isNew = !previous;
  const pendingNew = isNew || previous?.metadata?.import_status === "new";
  const wasAbsent = previous?.metadata?.absent_from_price === true;

  let visible: boolean;
  if (pendingNew) visible = false;
  else if (wasAbsent) visible = true;
  else visible = previous?.visible ?? true;

  const description =
    (descriptionRaw || "").trim() ||
    previous?.metadata?.description ||
    "";

  return {
    id,
    name: displayName,
    original_name: displayName,
    custom_name: nextCustom,
    sku,
    supplier: "concept",
    visible,
    section_id: section.id,
    section_name: section.name,
    price: priced.price,
    calculated_price: priced.price,
    price_override: previous?.price_override ?? null,
    price_without_vat: priced.priceWithoutVat,
    vat_amount: priced.vatAmount,
    currency: "Br",
    currency_code: "BYN",
    vendor,
    metadata: {
      articul,
      type: section.name,
      url: sourceUrl || previous?.metadata?.url || "",
      price_section: sectionTitle,
      sections: [section.id],
      brand: vendor,
      unit: "шт",
      minQty: 1,
      multiplicity: 1,
      timeDelivery: onRequest ? "По запросу" : previous?.metadata?.timeDelivery || "",
      weight: 0,
      volume: 0,
      updated: nowStamp(),
      pictures: previous?.metadata?.pictures || [],
      video: previous?.metadata?.video || [],
      documents: previous?.metadata?.documents || [],
      zamena: [],
      analog: [],
      soputst: [],
      chars: previous?.metadata?.chars || [],
      description,
      cost_price:
        !onRequest && params.usd != null && params.usd > 0
          ? Number((params.usd * usdToBynRate).toFixed(2))
          : (previous?.metadata?.cost_price ?? null),
      ...(pendingNew ? { import_status: "new" as const } : {}),
    },
  };
}
