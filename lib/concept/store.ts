import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { ProductRaw, SectionRaw } from "@/lib/types";
import {
  CONCEPT_DIR,
  MICROINFORM_PRODUCTS_PATH,
  PRODUCTS_PATH,
  SECTION_MAP_PATH,
  SECTIONS_PATH,
  SETTINGS_PATH,
  SSD_PRODUCTS_PATH,
  STATE_PATH,
} from "./paths";
import { CONCEPT_ID_MIN } from "./sku";

export interface ConceptSettings {
  usdToBynRate: number;
  markupPercent: number;
  enabledBrands: string[];
}

export interface ConceptState {
  nextId: number;
  nextSkuSeq: number;
  articulToSku: Record<string, string>;
  articulToId: Record<string, number>;
}

export type SectionMapAction =
  | { action: "skip" }
  | { action: "existing"; sectionId: number }
  | {
      action: "create";
      name: string;
      externalId: string;
      parentId: number;
      selectedFilters?: string[];
    };

export type SectionMap = Record<string, SectionMapAction>;

const DEFAULT_SETTINGS: ConceptSettings = {
  usdToBynRate: 3,
  markupPercent: 15,
  enabledBrands: ["KIWI", "EXFO"],
};

const DEFAULT_STATE: ConceptState = {
  nextId: CONCEPT_ID_MIN,
  nextSkuSeq: 1,
  articulToSku: {},
  articulToId: {},
};

function ensureDir(): void {
  if (!existsSync(CONCEPT_DIR)) {
    mkdirSync(CONCEPT_DIR, { recursive: true });
  }
}

export function readSettings(): ConceptSettings {
  ensureDir();
  if (!existsSync(SETTINGS_PATH)) {
    writeSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
  const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Partial<ConceptSettings>;
  return {
    usdToBynRate:
      typeof raw.usdToBynRate === "number" && Number.isFinite(raw.usdToBynRate) && raw.usdToBynRate > 0
        ? raw.usdToBynRate
        : DEFAULT_SETTINGS.usdToBynRate,
    markupPercent:
      typeof raw.markupPercent === "number" && Number.isFinite(raw.markupPercent)
        ? raw.markupPercent
        : DEFAULT_SETTINGS.markupPercent,
    enabledBrands: Array.isArray(raw.enabledBrands)
      ? raw.enabledBrands.filter((v): v is string => typeof v === "string")
      : [...DEFAULT_SETTINGS.enabledBrands],
  };
}

export function writeSettings(settings: ConceptSettings): void {
  ensureDir();
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function readState(): ConceptState {
  ensureDir();
  if (!existsSync(STATE_PATH)) {
    writeState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }
  const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as Partial<ConceptState>;
  return {
    nextId: typeof raw.nextId === "number" ? raw.nextId : DEFAULT_STATE.nextId,
    nextSkuSeq: typeof raw.nextSkuSeq === "number" ? raw.nextSkuSeq : DEFAULT_STATE.nextSkuSeq,
    articulToSku:
      raw.articulToSku && typeof raw.articulToSku === "object" ? { ...raw.articulToSku } : {},
    articulToId:
      raw.articulToId && typeof raw.articulToId === "object" ? { ...raw.articulToId } : {},
  };
}

export function writeState(state: ConceptState): void {
  ensureDir();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function readSectionMap(): SectionMap {
  ensureDir();
  if (!existsSync(SECTION_MAP_PATH)) return {};
  return JSON.parse(readFileSync(SECTION_MAP_PATH, "utf-8")) as SectionMap;
}

export function writeSectionMap(map: SectionMap): void {
  ensureDir();
  writeFileSync(SECTION_MAP_PATH, JSON.stringify(map, null, 2), "utf-8");
}

export function readConceptProducts(): ProductRaw[] {
  if (!existsSync(PRODUCTS_PATH)) return [];
  const raw = readFileSync(PRODUCTS_PATH, "utf-8").trim();
  if (!raw) return [];
  return JSON.parse(raw) as ProductRaw[];
}

export function writeConceptProducts(products: ProductRaw[]): void {
  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

export function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(SECTIONS_PATH, "utf-8")) as SectionRaw[];
}

export function writeSections(sections: SectionRaw[]): void {
  const previous = existsSync(SECTIONS_PATH) ? readSections() : [];
  const byId = new Map<number, SectionRaw>();
  for (const section of previous) byId.set(section.id, section);
  for (const section of sections) byId.set(section.id, section);
  const merged = [...byId.values()].sort((a, b) => a.id - b.id);
  writeFileSync(SECTIONS_PATH, JSON.stringify(merged, null, 2), "utf-8");
}

export function readOccupiedSkus(): Set<string> {
  const set = new Set<string>();
  for (const filePath of [SSD_PRODUCTS_PATH, MICROINFORM_PRODUCTS_PATH, PRODUCTS_PATH]) {
    if (!existsSync(filePath)) continue;
    const raw = readFileSync(filePath, "utf-8").trim();
    if (!raw || raw.startsWith("version https://git-lfs.github.com/spec/v1")) continue;
    try {
      const products = JSON.parse(raw) as ProductRaw[];
      for (const product of products) {
        if (typeof product.sku === "string" && product.sku) set.add(product.sku);
      }
    } catch {
      /* skip broken file */
    }
  }
  return set;
}

export function readSsdProducts(): ProductRaw[] {
  if (!existsSync(SSD_PRODUCTS_PATH)) return [];
  const raw = readFileSync(SSD_PRODUCTS_PATH, "utf-8").trim();
  if (!raw || raw.startsWith("version https://git-lfs.github.com/spec/v1")) return [];
  return JSON.parse(raw) as ProductRaw[];
}

export function writeSsdProducts(products: ProductRaw[]): void {
  writeFileSync(SSD_PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}
