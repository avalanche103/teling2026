import type { ProductRaw, SectionRaw } from "@/lib/types";
import { buildConceptProduct, normalizeConceptArticul } from "./build-product";
import {
  extractArticulFromName,
  normalizeModelKey,
  readExfoCatalogCache,
  type ExfoCatalogItem,
} from "./exfo-catalog";
import { isExcludedKiwiProduct } from "./kiwi-filters";
import { readCachedKiwiPriceBook } from "./price-cache";
import type { ParsedKiwiPriceBook } from "./parse-kiwi-price";
import {
  buildDefaultSectionMap,
  defaultSectionIdForExfo,
  refineSectionId,
} from "./section-hints";
import {
  readConceptProducts,
  readOccupiedSkus,
  readSectionMap,
  readSettings,
  readState,
  readSections,
  writeConceptProducts,
  writeSectionMap,
  writeSections,
  writeSettings,
  writeState,
  type ConceptSettings,
  type ConceptState,
  type SectionMap,
  type SectionMapAction,
} from "./store";

function resolveOrCreateSection(
  action: SectionMapAction,
  sections: SectionRaw[],
): { section: SectionRaw | null; created: boolean; sections: SectionRaw[] } {
  if (action.action === "skip") return { section: null, created: false, sections };
  if (action.action === "existing") {
    const section = sections.find((s) => s.id === action.sectionId) || null;
    return { section, created: false, sections };
  }

  const existingBySlug = sections.find((s) => s.external_id === action.externalId);
  if (existingBySlug) return { section: existingBySlug, created: false, sections };

  const maxId = sections.reduce((m, s) => Math.max(m, s.id), 0);
  const newId = maxId + 1;
  const parent = sections.find((s) => s.id === action.parentId);
  if (!parent) {
    throw new Error(
      `Refusing to create Concept section "${action.name}": parent ${action.parentId} not found`,
    );
  }
  const level = (parent.metadata?.level ?? 1) + 1;
  const created: SectionRaw = {
    id: newId,
    name: action.name,
    parent: action.parentId,
    external_id: action.externalId,
    metadata: {
      id: newId,
      name: action.name,
      sort: 500,
      code: action.externalId,
      url: "",
      level,
      parent_id: action.parentId,
      picture: "",
      selected_filters: action.selectedFilters || ["brand", "price"],
      source: "concept",
    },
  };
  return { section: created, created: true, sections: [...sections, created] };
}

function productKey(vendor: string, articul: string): string {
  const normalized =
    vendor.toUpperCase() === "EXFO"
      ? normalizeModelKey(articul || extractArticulFromName(articul))
      : normalizeConceptArticul(vendor, articul);
  return `${vendor}::${normalized}`.toUpperCase();
}

export interface AnalyzeResult {
  settings: ConceptSettings;
  sectionMap: SectionMap;
  brands: string[];
  sections: Array<{
    title: string;
    vendor: string;
    productCount: number;
    mapping: SectionMapAction;
  }>;
  counts: {
    kiwiProducts: number;
    exfoProducts: number;
    selectedProducts: number;
    willCreateSections: number;
    willSkipSections: number;
  };
}

export function analyzeConceptCatalog(
  kiwiBook: ParsedKiwiPriceBook | null,
  exfoItems: ExfoCatalogItem[],
  sectionMapOverride?: SectionMap,
): AnalyzeResult {
  const settings = readSettings();
  const enabled = new Set(settings.enabledBrands.map((b) => b.toLowerCase()));
  const kiwiEnabled = enabled.has("kiwi");
  const exfoEnabled = enabled.has("exfo");

  const kiwiSections = kiwiEnabled ? kiwiBook?.sections || [] : [];
  const defaults = buildDefaultSectionMap([
    ...kiwiSections,
    ...(exfoEnabled ? [{ title: "EXFO", vendor: "EXFO" }] : []),
  ]);
  const savedMap = readSectionMap();
  const sectionMap: SectionMap = {
    ...defaults,
    ...savedMap,
    ...(sectionMapOverride || {}),
  };

  for (const section of kiwiSections) {
    if (!sectionMap[section.title]) sectionMap[section.title] = { action: "skip" };
  }
  if (exfoEnabled && !sectionMap.EXFO) {
    sectionMap.EXFO = { action: "existing", sectionId: 489 };
  }

  const mappedTitles = new Set(
    Object.entries(sectionMap)
      .filter(([, action]) => action.action !== "skip")
      .map(([title]) => title),
  );

  const kiwiSelected = kiwiEnabled
    ? (kiwiBook?.products || []).filter(
        (p) =>
          mappedTitles.has(p.sectionTitle) &&
          !isExcludedKiwiProduct(p.articul, p.name),
      )
    : [];
  const exfoSelected = exfoEnabled && mappedTitles.has("EXFO") ? exfoItems : [];

  const willCreateSections = new Set(
    Object.values(sectionMap)
      .filter((a) => a.action === "create")
      .map((a) => (a.action === "create" ? a.externalId : "")),
  ).size;

  const vendorSections = [
    ...kiwiSections.map((s) => ({ ...s, vendor: "KIWI" })),
    ...(exfoEnabled
      ? [{ title: "EXFO", vendor: "EXFO", productCount: exfoItems.length }]
      : []),
  ];

  return {
    settings,
    sectionMap,
    brands: ["KIWI", "EXFO"],
    sections: vendorSections.map((s) => ({
      title: s.title,
      vendor: s.vendor,
      productCount: s.productCount,
      mapping: sectionMap[s.title] || { action: "skip" },
    })),
    counts: {
      kiwiProducts: (kiwiBook?.products || []).filter(
        (p) => !isExcludedKiwiProduct(p.articul, p.name),
      ).length,
      exfoProducts: exfoItems.length,
      selectedProducts: kiwiSelected.length + exfoSelected.length,
      willCreateSections,
      willSkipSections: vendorSections.filter(
        (s) => (sectionMap[s.title] || { action: "skip" }).action === "skip",
      ).length,
    },
  };
}

export function analyzeFromCaches(sectionMapOverride?: SectionMap): AnalyzeResult {
  const kiwiBook = readCachedKiwiPriceBook();
  const exfo = readExfoCatalogCache()?.items || [];
  return analyzeConceptCatalog(kiwiBook, exfo, sectionMapOverride);
}

export interface ApplyResult {
  upserted: number;
  created: number;
  updated: number;
  hiddenAbsent: number;
  pendingNew: number;
  createdSections: string[];
  totalConcept: number;
  kiwiApplied: number;
  exfoApplied: number;
}

function findSectionById(sections: SectionRaw[], id: number | null): SectionRaw | null {
  if (id == null) return null;
  return sections.find((s) => s.id === id) || null;
}

function mergeExfoPrevious(
  previous: ProductRaw | null,
  item: ExfoCatalogItem,
): ProductRaw | null {
  if (!previous) return null;
  return {
    ...previous,
    metadata: {
      ...previous.metadata,
      pictures: previous.metadata.pictures?.length
        ? previous.metadata.pictures
        : item.pictures || [],
      description: previous.metadata.description || item.description || "",
      url: previous.metadata.url || item.url || "",
    },
  };
}

export function applyConceptCatalog(params: {
  kiwiBook: ParsedKiwiPriceBook | null;
  exfoItems?: ExfoCatalogItem[];
  sectionMapInput: SectionMap;
  settingsPatch?: Partial<ConceptSettings>;
}): ApplyResult {
  const settings = { ...readSettings(), ...(params.settingsPatch || {}) };
  writeSettings(settings);
  writeSectionMap(params.sectionMapInput);

  const enabled = new Set(settings.enabledBrands.map((b) => b.toLowerCase()));
  const exfoItems = params.exfoItems ?? readExfoCatalogCache()?.items ?? [];

  let sections = readSections();
  const createdSections: string[] = [];
  const titleToSection = new Map<string, SectionRaw>();

  for (const [title, action] of Object.entries(params.sectionMapInput)) {
    const resolved = resolveOrCreateSection(action, sections);
    sections = resolved.sections;
    if (resolved.created && resolved.section) createdSections.push(resolved.section.name);
    if (resolved.section) titleToSection.set(title, resolved.section);
  }
  writeSections(sections);

  const state: ConceptState = readState();
  const occupied = readOccupiedSkus();
  for (const sku of Object.values(state.articulToSku)) occupied.add(sku);

  const previous = readConceptProducts();
  const previousByKey = new Map<string, ProductRaw>();
  for (const p of previous) {
    const vendor = p.vendor || p.metadata?.brand || "";
    const articul = p.metadata?.articul || "";
    if (!vendor || !articul) continue;
    previousByKey.set(productKey(vendor, articul), p);
    if (vendor.toUpperCase() === "EXFO") {
      const fromName = extractArticulFromName(p.custom_name || p.name || "");
      if (fromName) previousByKey.set(productKey("EXFO", fromName), p);
    }
  }

  const nextProducts: ProductRaw[] = [];
  const keepKeys = new Set<string>();
  let created = 0;
  let updated = 0;
  let kiwiApplied = 0;
  let exfoApplied = 0;

  if (enabled.has("kiwi") && params.kiwiBook) {
    for (const row of params.kiwiBook.products) {
      if (isExcludedKiwiProduct(row.articul, row.name)) continue;
      const titleSection = titleToSection.get(row.sectionTitle);
      if (!titleSection) continue;
      const refinedId = refineSectionId(
        row.sectionTitle,
        row.articul,
        row.name,
        titleSection.id,
      );
      const section = findSectionById(sections, refinedId) || titleSection;
      const key = productKey("KIWI", row.articul);
      const prev = previousByKey.get(key) || null;
      const product = buildConceptProduct({
        vendor: "KIWI",
        articul: row.articul,
        name: row.name,
        usd: row.usd,
        section,
        sectionTitle: row.sectionTitle,
        descriptionRaw: row.descriptionRaw,
        usdToBynRate: settings.usdToBynRate,
        markupPercent: settings.markupPercent,
        state,
        occupiedSkus: occupied,
        previous: prev,
      });
      nextProducts.push(product);
      keepKeys.add(key);
      kiwiApplied += 1;
      if (prev) updated += 1;
      else created += 1;
    }
  }

  if (enabled.has("exfo") && titleToSection.has("EXFO")) {
    for (const item of exfoItems) {
      const sectionId = defaultSectionIdForExfo(item.name, item.articul);
      const section =
        findSectionById(sections, sectionId) ||
        titleToSection.get("EXFO") ||
        findSectionById(sections, 489);
      if (!section) continue;
      const key = productKey("EXFO", item.articul);
      const prev = previousByKey.get(key) || null;
      const product = buildConceptProduct({
        vendor: "EXFO",
        articul: item.articul,
        name: item.name,
        usd: null,
        section,
        sectionTitle: item.sectionTitle || "EXFO",
        sourceUrl: item.url,
        descriptionRaw: item.description || "",
        usdToBynRate: settings.usdToBynRate,
        markupPercent: settings.markupPercent,
        state,
        occupiedSkus: occupied,
        previous: mergeExfoPrevious(prev, item),
        priceOnRequest: true,
      });
      if (item.pictures?.length && !product.metadata.pictures.length) {
        product.metadata.pictures = item.pictures;
      }
      if (item.description && !product.metadata.description) {
        product.metadata.description = item.description;
      }
      nextProducts.push(product);
      keepKeys.add(key);
      exfoApplied += 1;
      if (prev) updated += 1;
      else created += 1;
    }
  }

  const absentStamp = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  })();

  let hiddenAbsent = 0;
  for (const prev of previous) {
    const vendor = prev.vendor || prev.metadata?.brand || "";
    const articul = prev.metadata?.articul || "";
    const key = productKey(vendor, articul);
    if (!key || keepKeys.has(key)) continue;
    if (vendor === "KIWI" && !enabled.has("kiwi")) {
      nextProducts.push(prev);
      continue;
    }
    if (vendor === "EXFO" && !enabled.has("exfo")) {
      nextProducts.push(prev);
      continue;
    }
    hiddenAbsent += 1;
    nextProducts.push({
      ...prev,
      visible: false,
      metadata: {
        ...prev.metadata,
        absent_from_price: true,
        updated: absentStamp,
      },
    });
  }

  const pendingNew = nextProducts.filter((p) => p.metadata?.import_status === "new").length;
  writeConceptProducts(nextProducts);
  writeState(state);

  return {
    upserted: created + updated,
    created,
    updated,
    hiddenAbsent,
    pendingNew,
    createdSections,
    totalConcept: nextProducts.length,
    kiwiApplied,
    exfoApplied,
  };
}
