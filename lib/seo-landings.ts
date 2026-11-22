import { readFileSync } from "fs";
import path from "path";
import { slugify } from "@/lib/slugify";
import {
  getCategoryBySlug,
  getSectionProductCount,
  getSectionProducts,
} from "@/lib/data";

export type SeoLandingType = "brand" | "series";

export interface SeoLandingMatch {
  nameIncludes: string[];
  brands?: string[];
}

export interface SeoLandingConfig {
  categorySlug: string;
  slug: string;
  type: SeoLandingType;
  brand?: string;
  displayName?: string;
  h1: string;
  title: string;
  description?: string;
  match?: SeoLandingMatch;
}

interface SeoLandingsFile {
  minProducts?: number;
  landings: SeoLandingConfig[];
}

export interface ResolvedSeoLanding {
  config: SeoLandingConfig;
  categorySlug: string;
  landingSlug: string;
  href: string;
  displayName: string;
  h1: string;
  title: string;
  description: string;
  /** Brand filter for listing (brand landings only). */
  brands?: string[];
  /** Name substring filter for series landings. */
  nameIncludes?: string[];
  productCount: number;
}

const DATA_PATH = path.join(process.cwd(), "data", "seo-landings.json");

let _file: SeoLandingsFile | null = null;
let _byKey: Map<string, SeoLandingConfig> | null = null;
let _byCategoryBrand: Map<string, SeoLandingConfig> | null = null;

function landingKey(categorySlug: string, landingSlug: string): string {
  return `${categorySlug}::${landingSlug}`;
}

function brandKey(categorySlug: string, brand: string): string {
  return `${categorySlug}::brand::${brand.trim().toLowerCase()}`;
}

function loadFile(): SeoLandingsFile {
  if (_file) return _file;
  try {
    const raw = readFileSync(DATA_PATH, "utf-8");
    _file = JSON.parse(raw) as SeoLandingsFile;
  } catch {
    _file = { minProducts: 5, landings: [] };
  }
  return _file;
}

function indexes() {
  if (_byKey && _byCategoryBrand) {
    return { byKey: _byKey, byCategoryBrand: _byCategoryBrand };
  }
  const file = loadFile();
  const byKey = new Map<string, SeoLandingConfig>();
  const byCategoryBrand = new Map<string, SeoLandingConfig>();
  for (const landing of file.landings || []) {
    byKey.set(landingKey(landing.categorySlug, landing.slug), landing);
    if (landing.type === "brand" && landing.brand) {
      byCategoryBrand.set(brandKey(landing.categorySlug, landing.brand), landing);
    }
  }
  _byKey = byKey;
  _byCategoryBrand = byCategoryBrand;
  return { byKey, byCategoryBrand };
}

export function getMinSeoLandingProducts(): number {
  return loadFile().minProducts ?? 5;
}

export function getAllSeoLandingConfigs(): SeoLandingConfig[] {
  return loadFile().landings || [];
}

export function getSeoLandingsForCategory(categorySlug: string): SeoLandingConfig[] {
  return getAllSeoLandingConfigs().filter((l) => l.categorySlug === categorySlug);
}

export function getBrandSeoLanding(
  categorySlug: string,
  brand: string
): SeoLandingConfig | null {
  return indexes().byCategoryBrand.get(brandKey(categorySlug, brand)) ?? null;
}

export function buildSeoLandingHref(categorySlug: string, landingSlug: string): string {
  return `/catalog/${categorySlug}/${landingSlug}`;
}

/** Path for a single brand when a Tier SEO landing exists; otherwise null. */
export function getBrandSeoHref(categorySlug: string, brand: string): string | null {
  const landing = getBrandSeoLanding(categorySlug, brand);
  if (!landing) return null;
  return buildSeoLandingHref(landing.categorySlug, landing.slug);
}

function displayNameOf(config: SeoLandingConfig): string {
  if (config.type === "brand") return config.brand || config.displayName || config.slug;
  return config.displayName || config.slug;
}

function countLandingProducts(config: SeoLandingConfig): number {
  const category = getCategoryBySlug(config.categorySlug);
  if (!category) return 0;
  if (config.type === "brand" && config.brand) {
    return getSectionProducts(category.id, {
      page: 1,
      limit: 1,
      includeDescendants: true,
      brands: [config.brand],
    }).total;
  }
  const nameIncludes = config.match?.nameIncludes;
  if (!nameIncludes?.length) return 0;
  return getSectionProducts(category.id, {
    page: 1,
    limit: 1,
    includeDescendants: true,
    nameIncludes,
    brands: config.match?.brands,
  }).total;
}

export function resolveSeoLanding(
  categorySlug: string,
  landingSlug: string
): ResolvedSeoLanding | null {
  const config = indexes().byKey.get(landingKey(categorySlug, landingSlug));
  if (!config) return null;

  const category = getCategoryBySlug(categorySlug);
  if (!category) return null;

  const productCount = countLandingProducts(config);
  if (productCount < getMinSeoLandingProducts()) return null;

  const displayName = displayNameOf(config);
  const h1 = config.h1 || `${category.name} ${displayName}`;
  const title = config.title || `${h1} - Каталог`;
  const description =
    config.description ||
    `Купить ${h1.toLowerCase()} в каталоге Teling.by: ${productCount} товаров, характеристики, цены и наличие.`;

  return {
    config,
    categorySlug,
    landingSlug,
    href: buildSeoLandingHref(categorySlug, landingSlug),
    displayName,
    h1,
    title,
    description,
    brands: config.type === "brand" && config.brand ? [config.brand] : undefined,
    nameIncludes: config.type === "series" ? config.match?.nameIncludes : undefined,
    productCount,
  };
}

export function listIndexableSeoLandings(): ResolvedSeoLanding[] {
  const out: ResolvedSeoLanding[] = [];
  for (const config of getAllSeoLandingConfigs()) {
    const resolved = resolveSeoLanding(config.categorySlug, config.slug);
    if (resolved) out.push(resolved);
  }
  return out;
}

/** Tags for a category page: brand + series landings that still have enough products. */
export function listSeoLandingTags(categorySlug: string): Array<{
  href: string;
  label: string;
}> {
  return getSeoLandingsForCategory(categorySlug)
    .map((config) => resolveSeoLanding(config.categorySlug, config.slug))
    .filter((x): x is ResolvedSeoLanding => Boolean(x))
    .map((x) => ({ href: x.href, label: x.displayName }));
}

/** Brand display name → SEO path for client filter navigation. */
export function getBrandSeoHrefMap(categorySlug: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const config of getSeoLandingsForCategory(categorySlug)) {
    if (config.type !== "brand" || !config.brand) continue;
    const resolved = resolveSeoLanding(config.categorySlug, config.slug);
    if (!resolved) continue;
    map[config.brand] = resolved.href;
  }
  return map;
}

/** Prefer explicit config slug; fall back to slugify(brand) for future auto pages. */
export function brandToLandingSlug(brand: string): string {
  return slugify(brand);
}

/** True when category product count is enough to bother showing SEO tags. */
export function categoryHasSeoTags(categorySlug: string): boolean {
  return listSeoLandingTags(categorySlug).length > 0;
}

export function sectionHasEnoughProducts(sectionId: number): boolean {
  return getSectionProductCount(sectionId) >= getMinSeoLandingProducts();
}
