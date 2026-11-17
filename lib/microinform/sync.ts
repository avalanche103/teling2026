import type { ProductRaw, SectionRaw } from "@/lib/types";
import { normalizeMicroinformArticul } from "./articul";
import { buildMicroinformProduct } from "./build-product";
import type { ParsedPriceBook, ParsedPriceRow } from "./parse-price";
import {
  buildDefaultSectionMap,
  classifyPriceSection,
  classifyProductGroup,
  sectionIdForGroup,
} from "./section-hints";
import {
  readMicroinformProducts,
  readSectionMap,
  readSettings,
  readSsdSkuSet,
  readState,
  readSections,
  writeMicroinformProducts,
  writeSectionMap,
  writeSections,
  writeSettings,
  writeState,
  type SectionMap,
  type SectionMapAction,
  type MicroinformSettings,
} from "./store";

function resolveRowSection(
  row: ParsedPriceRow,
  titleSection: SectionRaw | undefined,
  sections: SectionRaw[],
): SectionRaw | null {
  const group = classifyProductGroup(row.articul, row.name, row.sectionTitle, row.vendor);
  const sectionId = sectionIdForGroup(group);
  if (sectionId != null) {
    const byId = sections.find((s) => s.id === sectionId);
    if (byId) return byId;
  }
  return titleSection || null;
}

function rowDedupeKey(row: ParsedPriceRow): string {
  const articul = normalizeMicroinformArticul(row.vendor, row.articul);
  return `${row.vendor}::${articul}`.toUpperCase();
}

function dedupeRows(rows: ParsedPriceRow[]): ParsedPriceRow[] {
  const best = new Map<string, ParsedPriceRow>();
  for (const row of rows) {
    const key = rowDedupeKey(row);
    const prev = best.get(key);
    // Same D-Link model with different HW revision → keep the higher price A.
    if (!prev || row.priceA > prev.priceA) best.set(key, row);
  }
  return [...best.values()].map((row) => {
    const articul = normalizeMicroinformArticul(row.vendor, row.articul);
    if (articul === row.articul) return row;
    return { ...row, articul };
  });
}

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

  // Always allocate above every known section id so we never collide with SSD leaves.
  const maxId = sections.reduce((m, s) => Math.max(m, s.id), 0);
  const newId = maxId + 1;
  if (sections.some((s) => s.id === newId)) {
    throw new Error(`Refusing to create Microinform section with colliding id ${newId}`);
  }
  const parent = sections.find((s) => s.id === action.parentId);
  if (!parent) {
    throw new Error(
      `Refusing to create Microinform section "${action.name}": parent ${action.parentId} not found`,
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
      selected_filters: action.selectedFilters || [],
      source: "microinform",
    },
  };
  return { section: created, created: true, sections: [...sections, created] };
}

export interface AnalyzeResult {
  settings: MicroinformSettings;
  sectionMap: SectionMap;
  vendors: string[];
  sections: Array<{
    title: string;
    vendor: string;
    productCount: number;
    group: string;
    mapping: SectionMapAction;
  }>;
  counts: {
    selectedProducts: number;
    willCreateSections: number;
    willUpsert: number;
    willSkipSections: number;
    duplicatesCollapsed: number;
  };
  duplicateArticuls: string[];
}

export function analyzePriceBook(
  book: ParsedPriceBook,
  sectionMapOverride?: SectionMap,
): AnalyzeResult {
  const settings = readSettings();
  const enabled = new Set(settings.enabledVendors.map((v) => v.toLowerCase()));
  const vendorSections = book.sections.filter((s) => enabled.has(s.vendor.toLowerCase()));
  const defaults = buildDefaultSectionMap(vendorSections);
  const savedMap = readSectionMap();
  const sectionMap: SectionMap = {
    ...defaults,
    ...savedMap,
    ...(sectionMapOverride || {}),
  };

  for (const section of vendorSections) {
    if (!sectionMap[section.title]) {
      sectionMap[section.title] = { action: "skip" };
    }
  }

  const mappedTitles = new Set(
    Object.entries(sectionMap)
      .filter(([, action]) => action.action !== "skip")
      .map(([title]) => title),
  );

  const selectedRows = book.products.filter(
    (p) => enabled.has(p.vendor.toLowerCase()) && mappedTitles.has(p.sectionTitle),
  );
  const before = selectedRows.length;
  const deduped = dedupeRows(selectedRows);

  const duplicateArticuls = [
    ...new Set(
      selectedRows
        .map((r) => rowDedupeKey(r))
        .filter((key, _, arr) => arr.filter((x) => x === key).length > 1),
    ),
  ].slice(0, 50);

  const willCreateSections = new Set(
    Object.values(sectionMap)
      .filter((a) => a.action === "create")
      .map((a) => (a.action === "create" ? a.externalId : "")),
  ).size;

  const willSkipSections = vendorSections.filter(
    (s) => (sectionMap[s.title] || { action: "skip" }).action === "skip",
  ).length;

  return {
    settings,
    sectionMap,
    vendors: book.vendors,
    sections: vendorSections.map((s) => ({
      title: s.title,
      vendor: s.vendor,
      productCount: s.productCount,
      group: classifyPriceSection(s.title, s.vendor),
      mapping: sectionMap[s.title] || { action: "skip" },
    })),
    counts: {
      selectedProducts: deduped.length,
      willCreateSections,
      willUpsert: deduped.length,
      willSkipSections,
      duplicatesCollapsed: before - deduped.length,
    },
    duplicateArticuls,
  };
}

export interface ApplyResult {
  upserted: number;
  created: number;
  updated: number;
  hiddenAbsent: number;
  pendingNew: number;
  createdSections: string[];
  /** @deprecated Prefer hiddenAbsent — kept for older admin clients. */
  removedOrHidden: number;
  totalMicroinform: number;
}

function productArticulKey(product: ProductRaw): string {
  return normalizeMicroinformArticul(
    product.vendor || product.metadata?.brand || "",
    product.metadata?.articul || "",
  ).toUpperCase();
}

export function applyPriceBook(
  book: ParsedPriceBook,
  sectionMapInput: SectionMap,
  settingsPatch?: Partial<MicroinformSettings>,
): ApplyResult {
  const settings = { ...readSettings(), ...(settingsPatch || {}) };
  writeSettings(settings);
  writeSectionMap(sectionMapInput);

  const enabled = new Set(settings.enabledVendors.map((v) => v.toLowerCase()));
  let sections = readSections();
  const createdSections: string[] = [];
  const titleToSection = new Map<string, SectionRaw>();

  for (const [title, action] of Object.entries(sectionMapInput)) {
    const resolved = resolveOrCreateSection(action, sections);
    sections = resolved.sections;
    if (resolved.created && resolved.section) {
      createdSections.push(resolved.section.name);
    }
    if (resolved.section) titleToSection.set(title, resolved.section);
  }
  writeSections(sections);

  const selectedRows = dedupeRows(
    book.products.filter(
      (p) => enabled.has(p.vendor.toLowerCase()) && titleToSection.has(p.sectionTitle),
    ),
  );

  const state = readState();
  const occupied = readSsdSkuSet();
  for (const sku of Object.values(state.articulToSku)) occupied.add(sku);

  const previous = readMicroinformProducts();
  const previousByArticul = new Map<string, ProductRaw>();
  for (const p of previous) {
    if (!p.metadata?.articul) continue;
    const key = productArticulKey(p);
    const existing = previousByArticul.get(key);
    if (!existing) {
      previousByArticul.set(key, p);
      continue;
    }
    // Prefer richer enrich data when several HW revisions already exist.
    const score = (item: ProductRaw) =>
      (item.metadata?.description?.trim() ? 4 : 0) +
      (item.metadata?.pictures?.length || 0) +
      (item.price || 0) / 100000;
    if (score(p) > score(existing)) previousByArticul.set(key, p);
  }

  const nextProducts: ProductRaw[] = [];
  const keepArticuls = new Set<string>();
  let created = 0;
  let updated = 0;

  for (const row of selectedRows) {
    const titleSection = titleToSection.get(row.sectionTitle);
    const section = resolveRowSection(row, titleSection, sections);
    if (!section) continue;
    const normalized = normalizeMicroinformArticul(row.vendor, row.articul);
    const key = normalized.toUpperCase();
    const prev = previousByArticul.get(key) || null;
    const product = buildMicroinformProduct({
      row,
      section,
      markupPercent: settings.markupPercent,
      state,
      occupiedSkus: occupied,
      previous: prev,
    });
    nextProducts.push(product);
    keepArticuls.add(key);
    if (prev) updated += 1;
    else created += 1;
  }

  // Keep products missing from this apply: hide, mark absent, preserve enrichment.
  const absentStamp = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  })();
  let hiddenAbsent = 0;
  for (const prev of previous) {
    const key = productArticulKey(prev);
    if (!key || keepArticuls.has(key)) continue;
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

  writeMicroinformProducts(nextProducts);
  writeState(state);

  return {
    upserted: created + updated,
    created,
    updated,
    hiddenAbsent,
    pendingNew,
    createdSections,
    removedOrHidden: hiddenAbsent,
    totalMicroinform: nextProducts.length,
  };
}
