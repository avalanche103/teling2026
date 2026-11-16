import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { ProductRaw, SectionRaw } from "@/lib/types";
import {
  MICROINFORM_DIR,
  PRODUCTS_PATH,
  SECTION_MAP_PATH,
  SECTIONS_PATH,
  SETTINGS_PATH,
  SSD_PRODUCTS_PATH,
  STATE_PATH,
} from "./paths";

export interface MicroinformSettings {
  priceUrl: string;
  markupPercent: number;
  enabledVendors: string[];
}

export interface MicroinformState {
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

const DEFAULT_SETTINGS: MicroinformSettings = {
  priceUrl: "https://microinform.by/downloads/Microinform_price.xls",
  markupPercent: 0,
  enabledVendors: ["D-Link", "Origo"],
};

const DEFAULT_STATE: MicroinformState = {
  nextId: 2_000_000,
  nextSkuSeq: 1,
  articulToSku: {},
  articulToId: {},
};

function ensureDir(): void {
  if (!existsSync(MICROINFORM_DIR)) {
    mkdirSync(MICROINFORM_DIR, { recursive: true });
  }
}

export function readSettings(): MicroinformSettings {
  ensureDir();
  if (!existsSync(SETTINGS_PATH)) {
    writeSettings(DEFAULT_SETTINGS);
    return { ...DEFAULT_SETTINGS };
  }
  const raw = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8")) as Partial<MicroinformSettings>;
  return {
    priceUrl: typeof raw.priceUrl === "string" ? raw.priceUrl : DEFAULT_SETTINGS.priceUrl,
    markupPercent:
      typeof raw.markupPercent === "number" && Number.isFinite(raw.markupPercent)
        ? raw.markupPercent
        : 0,
    enabledVendors: Array.isArray(raw.enabledVendors)
      ? raw.enabledVendors.filter((v): v is string => typeof v === "string")
      : [...DEFAULT_SETTINGS.enabledVendors],
  };
}

export function writeSettings(settings: MicroinformSettings): void {
  ensureDir();
  writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function readState(): MicroinformState {
  ensureDir();
  if (!existsSync(STATE_PATH)) {
    writeState(DEFAULT_STATE);
    return structuredClone(DEFAULT_STATE);
  }
  const raw = JSON.parse(readFileSync(STATE_PATH, "utf-8")) as Partial<MicroinformState>;
  return {
    nextId: typeof raw.nextId === "number" ? raw.nextId : DEFAULT_STATE.nextId,
    nextSkuSeq: typeof raw.nextSkuSeq === "number" ? raw.nextSkuSeq : DEFAULT_STATE.nextSkuSeq,
    articulToSku:
      raw.articulToSku && typeof raw.articulToSku === "object" ? { ...raw.articulToSku } : {},
    articulToId:
      raw.articulToId && typeof raw.articulToId === "object" ? { ...raw.articulToId } : {},
  };
}

export function writeState(state: MicroinformState): void {
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

export function readMicroinformProducts(): ProductRaw[] {
  if (!existsSync(PRODUCTS_PATH)) return [];
  const raw = readFileSync(PRODUCTS_PATH, "utf-8").trim();
  if (!raw) return [];
  return JSON.parse(raw) as ProductRaw[];
}

export function writeMicroinformProducts(products: ProductRaw[]): void {
  writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf-8");
}

export function readSections(): SectionRaw[] {
  return JSON.parse(readFileSync(SECTIONS_PATH, "utf-8")) as SectionRaw[];
}

export function writeSections(sections: SectionRaw[]): void {
  writeFileSync(SECTIONS_PATH, JSON.stringify(sections, null, 2), "utf-8");
}

export function readSsdSkuSet(): Set<string> {
  if (!existsSync(SSD_PRODUCTS_PATH)) return new Set();
  const raw = readFileSync(SSD_PRODUCTS_PATH, "utf-8").trim();
  if (!raw || raw.startsWith("version https://git-lfs.github.com/spec/v1")) return new Set();
  const products = JSON.parse(raw) as ProductRaw[];
  const set = new Set<string>();
  for (const product of products) {
    if (typeof product.sku === "string" && product.sku) set.add(product.sku);
  }
  return set;
}
