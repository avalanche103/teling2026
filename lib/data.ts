import path from "path";
import { existsSync, readFileSync } from "fs";
import type {
  SectionRaw,
  ProductRaw,
  Category,
  Product,
  ProductSummary,
  SectionFacets,
  CharFacet,
  FacetItem,
  ProductSort,
  CatalogNavNode,
  ActiveFilters,
  ProductCharGroup,
} from "./types";
import {
  isFacetableCharValue,
  normalizeCharValue,
} from "./normalize-char";
import { getProductViewCount } from "./product-views";
import {
  groupForSectionId,
  refineActiveNetworkChars,
} from "./microinform/chars";
import { inferUpsBrand } from "./microinform/ups-brand";
import { isConceptOwnedBrand } from "./concept/blocked-brands";

// ---- Module-level lazy caches ----

let _products: ProductRaw[] | null = null;
let _productsBySkuMap: Map<string, ProductRaw> | null = null;
let _productsBySectionMap: Map<number, ProductRaw[]> | null = null;
let _categoryTree: Category[] | null = null;
let _sectionPopularImageMap: Map<number, SectionImagePick> | null = null;
let _sectionProductCountMap: Map<number, number> | null = null;

function isGitLfsPointer(text: string): boolean {
  return text.startsWith("version https://git-lfs.github.com/spec/v1");
}

export function invalidateSectionCaches(): void {
  _categoryTree = null;
  _sectionPopularImageMap = null;
  _sectionProductCountMap = null;
}

export function invalidateProductCaches(): void {
  _products = null;
  _productsBySkuMap = null;
  _productsBySectionMap = null;
  _categoryTree = null;
  _sectionPopularImageMap = null;
  _sectionProductCountMap = null;
}

function getSectionsRaw(): SectionRaw[] {
  const filePath = path.join(process.cwd(), "data", "sections.json");
  return JSON.parse(readFileSync(filePath, "utf-8")) as SectionRaw[];
}

function readJsonProductsFile(filePath: string, label: string): ProductRaw[] {
  if (!existsSync(filePath)) return [];
  const raw = readFileSync(filePath, "utf-8").trim();
  if (!raw) return [];
  if (isGitLfsPointer(raw)) {
    console.warn(
      `[data] ${label} is a Git LFS pointer; using an empty product list until LFS assets are fetched.`,
    );
    return [];
  }
  return JSON.parse(raw) as ProductRaw[];
}

/** Apply shared UPS filter chars + brand inference for SSD↔Microinform section overlap. */
function normalizeSharedUpsProduct(product: ProductRaw): ProductRaw {
  const group = groupForSectionId(product.section_id);
  if (
    !group ||
    (group !== "ups" &&
      group !== "ups_batteries" &&
      group !== "ups_inverters" &&
      group !== "ups_bypass" &&
      group !== "ups_mgmt" &&
      group !== "ups_mounts" &&
      group !== "pdu")
  ) {
    return product;
  }

  const articul =
    (typeof product.metadata?.articul === "string" && product.metadata.articul) ||
    product.sku ||
    "";
  const sectionTitle =
    (typeof product.metadata?.price_section === "string" && product.metadata.price_section) ||
    product.section_name ||
    "";
  const nextChars = refineActiveNetworkChars(
    group,
    sectionTitle,
    product.name || product.custom_name || "",
    articul,
    product.metadata?.chars,
  );

  const inferredBrand = inferUpsBrand({
    name: product.name || product.custom_name || "",
    vendor: product.vendor,
    brand: product.metadata?.brand,
    articul,
  });

  const brand =
    inferredBrand ||
    (product.metadata?.brand || product.vendor || "").trim();

  return {
    ...product,
    vendor: product.vendor || brand || product.vendor,
    metadata: {
      ...product.metadata,
      brand: brand || product.metadata?.brand || "",
      chars: nextChars,
    },
  };
}

function getProductsRaw(): ProductRaw[] {
  if (!_products) {
    const ssdPath = path.join(process.cwd(), "data", "products.json");
    const microinformPath = path.join(process.cwd(), "data", "products.microinform.json");
    const conceptPath = path.join(process.cwd(), "data", "products.concept.json");
    const ssd = readJsonProductsFile(ssdPath, "products.json")
      .filter(
        (product) =>
          !isConceptOwnedBrand(product.vendor, product.metadata?.brand, product.name),
      )
      .map((product) =>
        normalizeSharedUpsProduct({
          ...product,
          supplier: product.supplier || ("ssd" as const),
        }),
      );
    const microinform = readJsonProductsFile(microinformPath, "products.microinform.json").map(
      (product) =>
        normalizeSharedUpsProduct({
          ...product,
          supplier: product.supplier || ("microinform" as const),
        }),
    );
    const concept = readJsonProductsFile(conceptPath, "products.concept.json").map(
      (product) =>
        normalizeSharedUpsProduct({
          ...product,
          supplier: product.supplier || ("concept" as const),
        }),
    );
    _products = [...ssd, ...microinform, ...concept];
  }
  return _products;
}

function isProductVisible(product: ProductRaw): boolean {
  return product.visible !== false;
}

function parseUpdatedTimestamp(value: string | undefined): Date | null {
  if (!value) return null;
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/,
  );
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  const parsed = new Date(
    Date.UTC(
      Number(y),
      Number(m) - 1,
      Number(d),
      Number(hh),
      Number(mm),
      Number(ss),
    ),
  );

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function maxDate(a: Date | null, b: Date | null): Date | null {
  if (!a) return b;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

function getVisibleProductsRaw(): ProductRaw[] {
  return getProductsRaw().filter(isProductVisible);
}

function getSectionBySlugMap(): Map<string, SectionRaw> {
  const map = new Map<string, SectionRaw>();
  for (const s of getSectionsRaw()) {
    map.set(s.external_id, s);
  }
  return map;
}

function getSectionSlugByIdMap(): Map<number, string> {
  const map = new Map<number, string>();
  for (const s of getSectionsRaw()) {
    map.set(s.id, s.external_id);
  }
  return map;
}

const PUBLIC_IMAGES_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "public",
  "images"
);

function getProductImageSources() {
  const sources = [{ dir: PUBLIC_IMAGES_DIR, publicBase: "/images" }];
  const legacyImagesDir = process.env.IMAGES_DIR;

  if (
    legacyImagesDir &&
    path.resolve(/* turbopackIgnore: true */ legacyImagesDir) !==
      path.resolve(PUBLIC_IMAGES_DIR)
  ) {
    sources.push({ dir: legacyImagesDir, publicBase: "/image" });
  }

  return sources;
}

function getLocalImageUrls(sku: string): string[] {
  const extensions = ["webp", "jpg", "jpeg", "png"];
  const imageSources = getProductImageSources();
  // Prefer cache-busted enrich names (`sku_g1.jpg`) over legacy `sku_1.jpg`.
  const prefixes = [`${sku}_g`, `${sku}_`];

  for (const prefix of prefixes) {
    const batch: string[] = [];
    for (let i = 1; i <= 8; i += 1) {
      let matched = false;
      for (const ext of extensions) {
        const filename = `${prefix}${i}.${ext}`;
        for (const source of imageSources) {
          const abs = path.join(/* turbopackIgnore: true */ source.dir, filename);
          if (existsSync(abs)) {
            batch.push(`${source.publicBase}/${encodeURIComponent(filename)}`);
            matched = true;
            break;
          }
        }
        if (matched) break;
      }
      if (!matched && batch.length > 0) break;
    }
    if (batch.length > 0) return batch;
  }

  return [];
}

function getProductsBySkuMap(): Map<string, ProductRaw> {
  if (!_productsBySkuMap) {
    _productsBySkuMap = new Map();
    for (const p of getVisibleProductsRaw()) {
      const sku = typeof p.sku === "string" ? p.sku.trim() : "";
      if (sku) {
        _productsBySkuMap.set(sku, p);
      }
    }
  }
  return _productsBySkuMap;
}

function getProductsBySectionMap(): Map<number, ProductRaw[]> {
  if (!_productsBySectionMap) {
    _productsBySectionMap = new Map();
    for (const p of getVisibleProductsRaw()) {
      const arr = _productsBySectionMap.get(p.section_id) ?? [];
      arr.push(p);
      _productsBySectionMap.set(p.section_id, arr);
    }
  }
  return _productsBySectionMap;
}

// ---- Category tree ----

/** Fast thumb lookup: local `_1.*` first, then metadata pictures (ssd.ru fallback). */
function getProductThumbnailUrlFast(product: ProductRaw): string | null {
  const sku = typeof product.sku === "string" ? product.sku.trim() : "";
  if (sku) {
    for (const ext of ["webp", "jpg", "jpeg", "png"]) {
      const filename = `${sku}_1.${ext}`;
      const abs = path.join(/* turbopackIgnore: true */ PUBLIC_IMAGES_DIR, filename);
      if (existsSync(abs)) {
        return `/images/${encodeURIComponent(filename)}`;
      }
    }
  }

  const externalImages = (product.metadata?.pictures || []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  return externalImages[0] ?? null;
}

/** Category photos only use products priced at least this many BYN. */
const SECTION_IMAGE_MIN_PRICE_BYN = 100;

type SectionImagePick = {
  url: string;
  views: number;
  productId: number;
  name: string;
};

/**
 * Section photo rank: more views, then earlier product id, then name Z→A.
 * Product id is the creation order — the catalog has no separate created-at field.
 */
function isBetterSectionImage(next: SectionImagePick, prev: SectionImagePick): boolean {
  if (next.views !== prev.views) return next.views > prev.views;
  if (next.productId !== prev.productId) return next.productId < prev.productId;
  return next.name.localeCompare(prev.name, "ru") > 0;
}

/** One pass over products → best image per direct section_id. */
function getSectionPopularImageMap(): Map<number, SectionImagePick> {
  if (_sectionPopularImageMap) return _sectionPopularImageMap;

  const bestBySection = new Map<number, SectionImagePick>();
  for (const product of getVisibleProductsRaw()) {
    const thumb = getProductThumbnailUrlFast(product);
    if (!thumb) continue;
    if (!(product.price >= SECTION_IMAGE_MIN_PRICE_BYN)) continue;
    const candidate: SectionImagePick = {
      url: thumb,
      views: getProductViewCount(product.sku),
      productId: product.id,
      name: (product.name || "").trim(),
    };
    const prev = bestBySection.get(product.section_id);
    if (!prev || isBetterSectionImage(candidate, prev)) {
      bestBySection.set(product.section_id, candidate);
    }
  }

  _sectionPopularImageMap = bestBySection;
  return _sectionPopularImageMap;
}

function getPopularImageForSectionIds(sectionIds: number[]): string | null {
  const map = getSectionPopularImageMap();
  let best: SectionImagePick | null = null;
  for (const id of sectionIds) {
    const candidate = map.get(id);
    if (!candidate) continue;
    if (!best || isBetterSectionImage(candidate, best)) best = candidate;
  }
  return best?.url ?? null;
}

function applyCategoryImages(roots: Category[]): void {
  // Ensure the popular-image map is built once before walking the tree.
  getSectionPopularImageMap();

  const visit = (cats: Category[]) => {
    for (const cat of cats) {
      const sectionIds = getAllDescendantIds(cat);
      const popularImage = getPopularImageForSectionIds(sectionIds);
      const sectionImage =
        typeof cat.imageUrl === "string" && cat.imageUrl.trim() ? cat.imageUrl.trim() : null;
      const popularIsLocal = Boolean(popularImage?.startsWith("/images/"));

      // Prefer locally downloaded product thumbs over remote section art (ssd.ru).
      if (popularIsLocal) {
        cat.imageUrl = popularImage;
        cat.fallbackImageUrl =
          sectionImage && sectionImage !== popularImage ? sectionImage : null;
      } else if (!sectionImage) {
        cat.imageUrl = popularImage;
        cat.fallbackImageUrl = null;
      } else {
        cat.imageUrl = sectionImage;
        cat.fallbackImageUrl =
          popularImage && popularImage !== sectionImage ? popularImage : null;
      }

      if (cat.children.length) visit(cat.children);
    }
  };
  visit(roots);
}

function buildCategoryTree(sections: SectionRaw[]): Category[] {
  const map = new Map<number, Category>();
  for (const s of sections) {
    const picture =
      typeof s.metadata?.picture === "string" && s.metadata.picture.trim()
        ? s.metadata.picture.trim()
        : null;
    map.set(s.id, {
      id: s.id,
      name: s.name,
      slug: s.external_id,
      parentId: s.parent,
      level: s.metadata?.level ?? 1,
      imageUrl: picture,
      fallbackImageUrl: null,
      sort: s.metadata?.sort ?? 0,
      children: [],
    });
  }

  const roots: Category[] = [];
  for (const cat of map.values()) {
    if (cat.parentId === null) {
      roots.push(cat);
    } else {
      const parent = map.get(cat.parentId);
      if (parent) {
        parent.children.push(cat);
      } else {
        roots.push(cat); // orphan → treat as root
      }
    }
  }

  const sortCats = (cats: Category[]) => {
    cats.sort((a, b) => a.sort - b.sort);
    for (const c of cats) sortCats(c.children);
  };
  sortCats(roots);
  applyCategoryImages(roots);
  return roots;
}

export function getCategoryTree(): Category[] {
  if (!_categoryTree) {
    _categoryTree = buildCategoryTree(getSectionsRaw());
  }
  return _categoryTree;
}

export function getRootCategories(): Category[] {
  return getCategoryTree().filter((c) => c.parentId === null);
}

function findCategoryById(cats: Category[], id: number): Category | null {
  for (const c of cats) {
    if (c.id === id) return c;
    const found = findCategoryById(c.children, id);
    if (found) return found;
  }
  return null;
}

export function getCategoryById(id: number): Category | null {
  return findCategoryById(getCategoryTree(), id);
}

export function getCategoryBySlug(slug: string): Category | null {
  const section = getSectionBySlugMap().get(slug);
  if (!section) return null;
  return getCategoryById(section.id);
}

/**
 * Returns selected filter keys for a section.
 * null => section has no explicit selection yet (treat as all available active by default)
 * []   => explicit empty selection (no filters enabled)
 */
export function getSectionSelectedFilters(sectionId: number): string[] | null {
  const section = getSectionsRaw().find((s) => s.id === sectionId);
  if (!section) return null;
  const selected = section.metadata?.selected_filters;
  if (!Array.isArray(selected)) return null;
  return selected.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/** Returns ancestor chain from root to parent (not including self) */
export function getCategoryAncestors(id: number): Category[] {
  const sections = getSectionsRaw();
  const ancestors: Category[] = [];
  let current = sections.find((s) => s.id === id);
  while (current?.parent != null) {
    const parent = sections.find((s) => s.id === current!.parent);
    if (!parent) break;
    const cat = getCategoryById(parent.id);
    if (cat) ancestors.unshift(cat);
    current = parent;
  }
  return ancestors;
}

function getAllDescendantIds(cat: Category): number[] {
  const ids: number[] = [cat.id];
  for (const child of cat.children) ids.push(...getAllDescendantIds(child));
  return ids;
}

// ---- Product mapping ----

function collectHighlights(p: ProductRaw): string[] {
  const highlights: string[] = [];
  const skipNames = new Set(
    ["производитель", "бренд", "brand", "марка", "торговая марка"].map((s) => s.toLowerCase())
  );
  const groups = p.metadata?.chars ?? [];
  const preferred = groups.find((g) => g.name?.trim() === "Характеристики") ?? groups[0];
  for (const item of preferred?.items ?? []) {
    const name = item.name?.trim();
    const value = item.value?.trim();
    if (!name || !value) continue;
    if (skipNames.has(name.toLowerCase())) continue;
    if (name.startsWith("-") || name.length > 28 || value.length > 24) continue;
    highlights.push(`${name}: ${value}`);
    if (highlights.length >= 2) break;
  }
  return highlights;
}

function rawToSummary(p: ProductRaw): ProductSummary {
  const sectionSlug = getSectionSlugByIdMap().get(p.section_id) || "";
  const sku = typeof p.sku === "string" ? p.sku : "";
  const name =
    typeof p.custom_name === "string" && p.custom_name.trim()
      ? p.custom_name
      : typeof p.name === "string" && p.name.trim()
      ? p.name
      : typeof p.original_name === "string" && p.original_name.trim()
      ? p.original_name
      : "Без названия";
  const localImages = sku ? getLocalImageUrls(sku) : [];
  const externalImages = (p.metadata?.pictures || []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  const brand = (p.metadata?.brand || p.vendor || "").trim();
  return {
    id: p.id,
    name,
    sku,
    visible: isProductVisible(p),
    sectionId: p.section_id,
    sectionName: p.section_name,
    sectionSlug,
    price: p.price,
    currency: p.currency,
    currencyCode: p.currency_code,
    brand: isPlaceholderBrand(brand) ? "" : brand,
    unit: p.metadata?.unit || "шт",
    type: p.metadata?.type || "",
    thumbnail: localImages[0] ?? externalImages[0] ?? null,
    highlights: collectHighlights(p),
  };
}

function isPlaceholderBrand(brand: string): boolean {
  return /^noname$/i.test(brand.trim());
}

function isJunkCharFacetName(name: string): boolean {
  const t = name.trim();
  if (!t) return true;
  if (t.startsWith("-")) return true;
  if (t.length > 48) return true;
  return false;
}

const PRIMARY_CHAR_GROUP = "Основные характеристики";
const SECONDARY_CHAR_GROUP = "Прочие характеристики";

/**
 * Yield char items for filtering/facets.
 * Prefer «Основные характеристики» over «Прочие» when the same name exists
 * in both (SSD short vs long duplicates). Also prefer synthetic
 * «Характеристики» when that name is present on the product.
 */
function iterPreferredCharItems(
  groups: ProductCharGroup[] | undefined | null,
): Array<{ name: string; value: string; groupName: string }> {
  if (!groups?.length) return [];

  const syntheticNames = new Set<string>();
  const primaryNames = new Set<string>();
  for (const group of groups) {
    const gn = group.name?.trim() || "";
    for (const item of group.items || []) {
      const name = item.name?.trim();
      if (!name) continue;
      if (gn === "Характеристики") syntheticNames.add(name);
      if (gn === PRIMARY_CHAR_GROUP) primaryNames.add(name);
    }
  }

  const out: Array<{ name: string; value: string; groupName: string }> = [];
  for (const group of groups) {
    const gn = group.name?.trim() || "";
    const isSynthetic = gn === "Характеристики";
    const isSecondary = gn === SECONDARY_CHAR_GROUP;
    for (const item of group.items || []) {
      const name = item.name?.trim();
      const value = item.value?.trim();
      if (!name || !value) continue;
      if (syntheticNames.has(name) && !isSynthetic) continue;
      if (isSecondary && primaryNames.has(name)) continue;
      out.push({ name, value, groupName: gn });
    }
  }
  return out;
}

function productDisplayName(p: ProductRaw): string {
  if (typeof p.custom_name === "string" && p.custom_name.trim()) return p.custom_name.trim();
  if (typeof p.name === "string" && p.name.trim()) return p.name.trim();
  if (typeof p.original_name === "string" && p.original_name.trim()) return p.original_name.trim();
  return "";
}

function sortProductsRaw(products: ProductRaw[], sort: ProductSort): ProductRaw[] {
  if (sort === "relevance") return products;

  const sorted = [...products];
  sorted.sort((a, b) => {
    if (sort === "price_asc" || sort === "price_desc") {
      const ap = a.price > 0 ? a.price : Number.POSITIVE_INFINITY;
      const bp = b.price > 0 ? b.price : Number.POSITIVE_INFINITY;
      if (ap !== bp) return sort === "price_asc" ? ap - bp : bp - ap;
      return productDisplayName(a).localeCompare(productDisplayName(b), "ru");
    }
    if (sort === "sku") {
      return (a.sku || "").localeCompare(b.sku || "", "ru", { numeric: true });
    }
    return productDisplayName(a).localeCompare(productDisplayName(b), "ru");
  });
  return sorted;
}

function collectSectionProductsRaw(
  sectionId: number,
  includeDescendants: boolean
): ProductRaw[] {
  const bySection = getProductsBySectionMap();
  let allProducts: ProductRaw[] = [];

  if (includeDescendants) {
    const cat = getCategoryById(sectionId);
    const ids = cat ? getAllDescendantIds(cat) : [sectionId];
    for (const id of ids) {
      allProducts.push(...(bySection.get(id) ?? []));
    }
  } else {
    allProducts = [...(bySection.get(sectionId) ?? [])];
  }

  return allProducts.filter(
    (p) => typeof p.sku === "string" && p.sku.trim().length > 0
  );
}

function applyProductFilters(
  products: ProductRaw[],
  options: {
    search?: string;
    brands?: string[];
    nameIncludes?: string[];
    priceMin?: number;
    priceMax?: number;
    charFilters?: Record<string, string[]>;
  }
): ProductRaw[] {
  let allProducts = products;

  const search = options.search?.trim();
  if (search) {
    const q = search.toLowerCase();
    allProducts = allProducts.filter((p) => {
      const name = typeof p.name === "string" ? p.name.toLowerCase() : "";
      const customName = typeof p.custom_name === "string" ? p.custom_name.toLowerCase() : "";
      const sku = typeof p.sku === "string" ? p.sku.toLowerCase() : "";
      const brand = (p.metadata?.brand || "").toLowerCase();
      return name.includes(q) || customName.includes(q) || sku.includes(q) || brand.includes(q);
    });
  }

  if (options.nameIncludes && options.nameIncludes.length > 0) {
    const needles = options.nameIncludes
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (needles.length) {
      allProducts = allProducts.filter((p) => {
        const hay = `${p.name || ""} ${p.custom_name || ""}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      });
    }
  }

  if (options.brands && options.brands.length > 0) {
    const brandSet = new Set(options.brands);
    allProducts = allProducts.filter((p) => {
      const b = (p.metadata?.brand || p.vendor || "").trim();
      return brandSet.has(b);
    });
  }

  if (options.priceMin !== undefined && options.priceMin > 0) {
    allProducts = allProducts.filter((p) => p.price >= options.priceMin!);
  }
  if (options.priceMax !== undefined && options.priceMax > 0) {
    allProducts = allProducts.filter((p) => p.price <= options.priceMax!);
  }

  if (options.charFilters && Object.keys(options.charFilters).length > 0) {
    allProducts = allProducts.filter((p) => {
      for (const [paramName, selectedValues] of Object.entries(options.charFilters!)) {
        if (!selectedValues.length) continue;
        const wanted = new Set(
          selectedValues
            .map((v) => normalizeCharValue(paramName, v) || v.trim())
            .filter(Boolean),
        );
        let found = false;
        for (const item of iterPreferredCharItems(p.metadata?.chars)) {
          if (item.name !== paramName) continue;
          const normalized = normalizeCharValue(paramName, item.value) || item.value;
          if (wanted.has(normalized) || wanted.has(item.value)) {
            found = true;
            break;
          }
        }
        if (!found) return false;
      }
      return true;
    });
  }

  return allProducts;
}

function rawToProduct(p: ProductRaw): Product {
  const localImages = getLocalImageUrls(p.sku);
  const externalImages = (p.metadata?.pictures || []).filter(
    (url): url is string => typeof url === "string" && url.trim().length > 0,
  );
  return {
    ...rawToSummary(p),
    priceWithoutVat: p.price_without_vat,
    vatAmount: p.vat_amount,
    timeDelivery: p.metadata?.timeDelivery || "",
    weight: p.metadata?.weight || 0,
    volume: p.metadata?.volume || 0,
    localImages,
    externalImages,
    video: p.metadata?.video || [],
    documents: p.metadata?.documents || [],
    relatedSkus: p.metadata?.soputst || [],
    analogSkus: p.metadata?.analog || [],
    replacementSkus: p.metadata?.zamena || [],
    chars: normalizeProductCharGroups(p.metadata?.chars || []),
    description: p.metadata?.description || "",
    externalUrl: p.metadata?.url || "",
    minQty: p.metadata?.minQty || 1,
    updatedAt: p.metadata?.updated || "",
  };
}

function normalizeProductCharGroups(
  groups: ProductCharGroup[],
): ProductCharGroup[] {
  const seen = new Set<string>();
  return groups.map((group) => ({
    ...group,
    items: (group.items || [])
      .map((item) => {
        const name = item.name?.trim() || "";
        const value = normalizeCharValue(name, item.value);
        if (!name || !value) return null;
        const key = `${name}\0${value}`;
        if (seen.has(key)) return null;
        seen.add(key);
        return { name, value };
      })
      .filter((item): item is { name: string; value: string } => item != null),
  }));
}

export function getProductBySku(sku: string): Product | null {
  const raw = getProductsBySkuMap().get(sku);
  return raw ? rawToProduct(raw) : null;
}

export function getProductSummaryBySku(sku: string): ProductSummary | null {
  const raw = getProductsBySkuMap().get(sku);
  return raw ? rawToSummary(raw) : null;
}

export interface GetSectionProductsOptions {
  page?: number;
  limit?: number;
  search?: string;
  includeDescendants?: boolean;
  brands?: string[];
  /** Case-insensitive substrings matched against product name / custom_name (OR). */
  nameIncludes?: string[];
  priceMin?: number;
  priceMax?: number;
  charFilters?: Record<string, string[]>;
  sort?: ProductSort;
}

export function getSectionProducts(
  sectionId: number,
  options: GetSectionProductsOptions = {}
): { products: ProductSummary[]; total: number } {
  const {
    page = 1,
    limit = 24,
    search = "",
    includeDescendants = true,
    brands,
    nameIncludes,
    priceMin,
    priceMax,
    charFilters,
    sort = "relevance",
  } = options;

  let allProducts = collectSectionProductsRaw(sectionId, includeDescendants);
  allProducts = applyProductFilters(allProducts, {
    search,
    brands,
    nameIncludes,
    priceMin,
    priceMax,
    charFilters,
  });
  allProducts = sortProductsRaw(allProducts, sort);

  const total = allProducts.length;
  const start = (page - 1) * limit;
  const slice = allProducts.slice(start, start + limit);
  return { products: slice.map(rawToSummary), total };
}

function buildSectionProductCountMap(): Map<number, number> {
  const map = new Map<number, number>();
  const bySection = getProductsBySectionMap();

  function walk(cat: Category): number {
    let count = (bySection.get(cat.id) ?? []).filter(
      (p) => typeof p.sku === "string" && p.sku.trim().length > 0
    ).length;
    for (const child of cat.children) {
      count += walk(child);
    }
    map.set(cat.id, count);
    return count;
  }

  for (const root of getCategoryTree()) walk(root);
  return map;
}

export function getSectionProductCount(sectionId: number): number {
  if (!_sectionProductCountMap) {
    _sectionProductCountMap = buildSectionProductCountMap();
  }
  return _sectionProductCountMap.get(sectionId) ?? 0;
}

export function getCatalogNavTree(): CatalogNavNode[] {
  const mapNode = (cat: Category): CatalogNavNode => ({
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    productCount: getSectionProductCount(cat.id),
    children: cat.children.map(mapNode),
  });
  return getRootCategories().map(mapNode);
}

function scoreProductForSearch(p: ProductRaw, variants: string[]): number {
  const sku = normalizeForSearch(typeof p.sku === "string" ? p.sku : "");
  const name = normalizeForSearch(typeof p.name === "string" ? p.name : "");
  const customName = normalizeForSearch(typeof p.custom_name === "string" ? p.custom_name : "");
  const brand = normalizeForSearch(p.metadata?.brand || "");
  const sectionName = normalizeForSearch(
    typeof p.section_name === "string" ? p.section_name : ""
  );
  if (!sku) return 0;

  let bestScore = 0;
  for (const term of variants) {
    if (!term) continue;
    // Ignore ultra-short stems matching too many SKUs/noise (keep 3+ for Cyrillic nouns like «муфт»)
    if (term.length < 3) continue;

    if (sku === term) {
      bestScore = Math.max(bestScore, 120 + Math.min(term.length, 15));
    } else if (sku.startsWith(term)) {
      bestScore = Math.max(bestScore, 100 + Math.min(term.length, 12));
    } else if (sku.includes(term)) {
      bestScore = Math.max(bestScore, 80 + Math.min(term.length, 10));
    }

    if (name.startsWith(term)) {
      bestScore = Math.max(bestScore, 65 + Math.min(term.length, 10));
    } else if (name.includes(term)) {
      bestScore = Math.max(bestScore, 45 + Math.min(term.length, 8));
    }

    if (customName.startsWith(term)) {
      bestScore = Math.max(bestScore, 70 + Math.min(term.length, 10));
    } else if (customName.includes(term)) {
      bestScore = Math.max(bestScore, 50 + Math.min(term.length, 8));
    }

    if (brand.includes(term)) {
      bestScore = Math.max(bestScore, 30 + Math.min(term.length, 6));
    }

    if (sectionName.includes(term)) {
      bestScore = Math.max(bestScore, 40 + Math.min(term.length, 8));
    }
  }
  return bestScore;
}

export function searchProducts(
  query: string,
  limit = 24
): ProductSummary[] {
  return searchProductsPaged(query, { page: 1, limit }).products;
}

export interface SearchProductsPagedOptions {
  page?: number;
  limit?: number;
  sort?: ProductSort;
  brands?: string[];
  priceMin?: number;
  priceMax?: number;
}

export function searchProductsPaged(
  query: string,
  options: SearchProductsPagedOptions = {}
): {
  products: ProductSummary[];
  total: number;
  sectionHints: Array<{ slug: string; name: string; count: number }>;
} {
  const q = query.trim().toLowerCase();
  if (!q) return { products: [], total: 0, sectionHints: [] };

  const {
    page = 1,
    limit = 24,
    sort = "relevance",
    brands,
    priceMin,
    priceMax,
  } = options;

  const variants = buildSearchVariants(q);
  const scored: Array<{ p: ProductRaw; score: number }> = [];

  for (const p of getProductsRaw()) {
    if (!isProductVisible(p)) continue;
    const score = scoreProductForSearch(p, variants);
    if (score > 0) scored.push({ p, score });
  }

  let filtered = scored.map((x) => x.p);
  filtered = applyProductFilters(filtered, { brands, priceMin, priceMax });

  const scoreById = new Map(scored.map((x) => [x.p.id, x.score]));
  if (sort === "relevance") {
    filtered.sort((a, b) => {
      const sa = scoreById.get(a.id) ?? 0;
      const sb = scoreById.get(b.id) ?? 0;
      if (sb !== sa) return sb - sa;
      return a.id - b.id;
    });
  } else {
    filtered = sortProductsRaw(filtered, sort);
  }

  const sectionCounts = new Map<string, { slug: string; name: string; count: number }>();
  for (const p of filtered) {
    const slug = getSectionSlugByIdMap().get(p.section_id) || "";
    if (!slug) continue;
    const prev = sectionCounts.get(slug);
    if (prev) prev.count += 1;
    else {
      sectionCounts.set(slug, {
        slug,
        name: p.section_name || slug,
        count: 1,
      });
    }
  }
  const sectionHints = [...sectionCounts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);

  const total = filtered.length;
  const start = (page - 1) * limit;
  return {
    products: filtered.slice(start, start + limit).map(rawToSummary),
    total,
    sectionHints,
  };
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
}

/** Chat/search filler words — keep product nouns, drop the rest. */
const SEARCH_STOPWORDS = new Set([
  "есть",
  "на",
  "в",
  "и",
  "или",
  "ли",
  "как",
  "какой",
  "какие",
  "какая",
  "какое",
  "что",
  "это",
  "сайт",
  "сайте",
  "сайту",
  "сайта",
  "можно",
  "нужно",
  "надо",
  "подскажите",
  "скажите",
  "пожалуйста",
  "здравствуйте",
  "привет",
  "для",
  "по",
  "из",
  "от",
  "до",
  "при",
  "про",
  "без",
  "не",
  "ни",
  "же",
  "бы",
  "то",
  "все",
  "всё",
  "еще",
  "ещё",
  "мне",
  "нам",
  "вас",
  "вам",
  "у",
  "с",
  "со",
  "а",
  "но",
  "да",
  "нет",
  "наличие",
  "прайс",
  "каталог",
  "каталоге",
]);

/** Light RU stem so «муфты» matches «муфта». */
function lightStemRu(token: string): string {
  const t = token.toLowerCase().replace(/ё/g, "е");
  if (t.length < 4) return t;
  const endings = [
    "ями",
    "ами",
    "иями",
    "ах",
    "ях",
    "ов",
    "ев",
    "ей",
    "ом",
    "ем",
    "ам",
    "ям",
    "ую",
    "юю",
    "ая",
    "яя",
    "ые",
    "ие",
    "ых",
    "их",
    "ой",
    "ий",
    "ый",
    "ое",
    "ее",
    "ыми",
    "ими",
    "ы",
    "и",
    "а",
    "я",
    "у",
    "ю",
    "о",
    "е",
    "ь",
  ];
  for (const end of endings) {
    if (t.length - end.length >= 3 && t.endsWith(end)) {
      return t.slice(0, -end.length);
    }
  }
  return t;
}

function buildSearchVariants(query: string): string[] {
  const raw = query.trim();
  if (!raw) return [];

  const candidates = new Set<string>();
  const add = (v: string) => {
    const n = normalizeForSearch(v);
    if (n) candidates.add(n);
  };

  add(raw);
  add(swapKeyboardLayout(raw));
  add(translitRuToLat(raw));
  add(translitLatToRu(raw));

  // Tokenize: «муфты есть на сайте?» → муфты / муфт
  const normalized = normalizeForSearch(raw);
  for (const word of normalized.split(/\s+/)) {
    if (word.length < 3) continue;
    if (SEARCH_STOPWORDS.has(word)) continue;
    add(word);
    const stem = lightStemRu(word);
    if (stem.length >= 3) add(stem);
  }

  // Keep terms with meaningful length first.
  return [...candidates].sort((a, b) => b.length - a.length);
}

function swapKeyboardLayout(input: string): string {
  const en = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
  const ru = "ёйцукенгшщзхъфывапролджэячсмитьбю.";
  const map = new Map<string, string>();

  for (let i = 0; i < en.length; i += 1) {
    map.set(en[i], ru[i]);
    map.set(ru[i], en[i]);
  }

  return input
    .split("")
    .map((ch) => {
      const lower = ch.toLowerCase();
      const mapped = map.get(lower);
      if (!mapped) return ch;
      return ch === lower ? mapped : mapped.toUpperCase();
    })
    .join("");
}

function translitRuToLat(input: string): string {
  const m: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };

  return input
    .toLowerCase()
    .split("")
    .map((c) => m[c] ?? c)
    .join("");
}

function translitLatToRu(input: string): string {
  let s = input.toLowerCase();
  const pairs: Array<[string, string]> = [
    ["sch", "щ"], ["sh", "ш"], ["ch", "ч"], ["yu", "ю"], ["ya", "я"], ["zh", "ж"], ["ts", "ц"],
    ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "й"],
    ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"],
    ["u", "у"], ["f", "ф"], ["h", "х"],
  ];

  for (const [lat, ru] of pairs) {
    s = s.replace(new RegExp(lat, "g"), ru);
  }
  return s;
}

export interface GetSectionFacetsOptions {
  search?: string;
  active?: ActiveFilters;
  /** Base name filter (SEO series landings). Applied before facet recompute. */
  nameIncludes?: string[];
}

/** First number in a facet value: "8", "до 60 Вт", "61–120 Вт", "1,8 м". */
function parseFacetNumber(value: string): number | null {
  const m = value
    .replace(/,/g, ".")
    .match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function isOtherFacetValue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "другое" || v === "нет" || v === "—";
}

/** True when most values in a facet look numeric (ports, watts, U, meters…). */
function isNumericFacetValues(values: string[]): boolean {
  if (values.length < 2) return false;
  let numeric = 0;
  for (const value of values) {
    if (isOtherFacetValue(value)) continue;
    if (parseFacetNumber(value) != null) numeric += 1;
  }
  const considered = values.filter((v) => !isOtherFacetValue(v)).length;
  return considered > 0 && numeric >= Math.ceil(considered * 0.7);
}

function compareFacetValues(
  aValue: string,
  bValue: string,
  aCount: number,
  bCount: number,
  allValues: string[],
): number {
  if (isNumericFacetValues(allValues)) {
    const aOther = isOtherFacetValue(aValue) ? 1 : 0;
    const bOther = isOtherFacetValue(bValue) ? 1 : 0;
    if (aOther !== bOther) return aOther - bOther;
    const aNum = parseFacetNumber(aValue);
    const bNum = parseFacetNumber(bValue);
    if (aNum != null && bNum != null && aNum !== bNum) return aNum - bNum;
    if (aNum != null && bNum == null) return -1;
    if (aNum == null && bNum != null) return 1;
    return aValue.localeCompare(bValue, "ru", { numeric: true });
  }
  return bCount - aCount;
}

function buildFacetsFromProducts(allProducts: ProductRaw[]): SectionFacets {
  const brandCounts = new Map<string, number>();
  for (const p of allProducts) {
    const brand = (p.metadata?.brand || p.vendor || "").trim();
    if (!brand || isPlaceholderBrand(brand)) continue;
    brandCounts.set(brand, (brandCounts.get(brand) ?? 0) + 1);
  }
  const brands: FacetItem[] = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, count }));

  let priceMin = Infinity;
  let priceMax = 0;
  for (const p of allProducts) {
    if (p.price > 0) {
      priceMin = Math.min(priceMin, p.price);
      priceMax = Math.max(priceMax, p.price);
    }
  }
  if (!isFinite(priceMin)) priceMin = 0;

  const BRAND_CHAR_NAMES = new Set(
    ["производитель", "бренд", "brand", "марка", "торговая марка"].map((s) =>
      s.toLowerCase()
    )
  );

  const sectionSyntheticNames = new Set<string>();
  for (const p of allProducts) {
    for (const group of p.metadata?.chars ?? []) {
      if (group.name?.trim() !== "Характеристики") continue;
      for (const item of group.items ?? []) {
        const name = item.name?.trim();
        if (name) sectionSyntheticNames.add(name);
      }
    }
  }

  const charMap = new Map<string, Map<string, number>>();
  for (const p of allProducts) {
    const seenOnProduct = new Set<string>();
    for (const item of iterPreferredCharItems(p.metadata?.chars)) {
      const name = item.name;
      if (isJunkCharFacetName(name)) continue;
      if (BRAND_CHAR_NAMES.has(name.toLowerCase())) continue;
      const value = normalizeCharValue(name, item.value);
      if (!value || !isFacetableCharValue(value)) continue;
      const dedupeKey = `${name}\0${value}`;
      if (seenOnProduct.has(dedupeKey)) continue;
      seenOnProduct.add(dedupeKey);
      if (!charMap.has(name)) charMap.set(name, new Map());
      const vm = charMap.get(name)!;
      vm.set(value, (vm.get(value) ?? 0) + 1);
    }
  }

  const chars: CharFacet[] = [];
  for (const [name, valMap] of charMap.entries()) {
    if (valMap.size < 2 || valMap.size > 30) continue;
    const entries = [...valMap.entries()];
    const values: FacetItem[] = entries
      .sort((a, b) => compareFacetValues(a[0], b[0], a[1], b[1], entries.map((e) => e[0])))
      .map(([value, count]) => ({ value, count }));
    chars.push({ name, values });
  }

  chars.sort((a, b) => {
    const aSyn = sectionSyntheticNames.has(a.name) ? 1 : 0;
    const bSyn = sectionSyntheticNames.has(b.name) ? 1 : 0;
    if (aSyn !== bSyn) return bSyn - aSyn;
    const sa = a.values.reduce((s, v) => s + v.count, 0);
    const sb = b.values.reduce((s, v) => s + v.count, 0);
    return sb - sa;
  });

  return { brands, priceMin, priceMax, chars: chars.slice(0, 24) };
}

/**
 * Facets with optional narrowing: counts shrink based on other active filters
 * (classic e-commerce facet behavior; each dimension ignores its own selection).
 */
function hasMeaningfulActiveFilters(
  active: GetSectionFacetsOptions["active"]
): boolean {
  if (!active) return false;
  return (
    active.brands.length > 0 ||
    active.priceMin != null ||
    active.priceMax != null ||
    Object.keys(active.charFilters).length > 0
  );
}

export function getSectionFacets(
  sectionId: number,
  options: GetSectionFacetsOptions = {}
): SectionFacets {
  const baseRaw = collectSectionProductsRaw(sectionId, true);
  const search = options.search?.trim() || "";
  const nameIncludes = options.nameIncludes;
  const base = nameIncludes?.length
    ? applyProductFilters(baseRaw, { nameIncludes })
    : baseRaw;
  const active = options.active;

  // Empty ActiveFilters object used to take the expensive per-char rebuild path
  // (hundreds of passes on Microinform sections like Коммутаторы).
  if (!hasMeaningfulActiveFilters(active)) {
    return buildFacetsFromProducts(
      applyProductFilters(base, { search })
    );
  }

  const withoutBrands = applyProductFilters(base, {
    search,
    priceMin: active!.priceMin ?? undefined,
    priceMax: active!.priceMax ?? undefined,
    charFilters: active!.charFilters,
  });
  const withoutPrice = applyProductFilters(base, {
    search,
    brands: active!.brands,
    charFilters: active!.charFilters,
  });
  const brandFacets = buildFacetsFromProducts(withoutBrands);
  const priceFacets = buildFacetsFromProducts(withoutPrice);

  // Only refine facets the user touched (plus any already selected char filters).
  // Do NOT iterate every discovered char name — that is O(chars × products).
  const charNames = new Set<string>(Object.keys(active!.charFilters));

  const chars: CharFacet[] = [];
  for (const charName of charNames) {
    const otherChars = { ...active!.charFilters };
    delete otherChars[charName];
    const subset = applyProductFilters(base, {
      search,
      brands: active!.brands,
      priceMin: active!.priceMin ?? undefined,
      priceMax: active!.priceMax ?? undefined,
      charFilters: otherChars,
    });
    const built = buildFacetsFromProducts(subset);
    const facet = built.chars.find((c) => c.name === charName);
    if (facet) chars.push(facet);
  }

  // Keep unrelated char facets from the brand-filtered set so the sidebar stays filled.
  for (const facet of brandFacets.chars) {
    if (!charNames.has(facet.name)) chars.push(facet);
  }

  chars.sort((a, b) => {
    const sa = a.values.reduce((s, v) => s + v.count, 0);
    const sb = b.values.reduce((s, v) => s + v.count, 0);
    return sb - sa;
  });

  return {
    brands: brandFacets.brands,
    priceMin: priceFacets.priceMin,
    priceMax: priceFacets.priceMax,
    chars: chars.slice(0, 24),
  };
}

/** Returns all section external_ids (slugs) for static params generation */
export function getAllSectionSlugs(): string[] {
  return getSectionsRaw().map((s) => s.external_id).filter(Boolean);
}

/** Returns all product SKUs for static params generation */
export function getAllProductSkus(): string[] {
  return getVisibleProductsRaw()
    .map((p) => (typeof p.sku === "string" ? p.sku.trim() : ""))
    .filter(Boolean);
}

/** Returns latest product update timestamp across visible products. */
export function getLatestProductsUpdatedAt(): Date | null {
  let latest: Date | null = null;

  for (const p of getVisibleProductsRaw()) {
    latest = maxDate(latest, parseUpdatedTimestamp(p.metadata?.updated));
  }

  return latest;
}

/** Returns per-product (SKU) update timestamps where available. */
export function getProductLastModifiedBySku(): Map<string, Date> {
  const map = new Map<string, Date>();

  for (const p of getVisibleProductsRaw()) {
    const sku = typeof p.sku === "string" ? p.sku.trim() : "";
    if (!sku) continue;

    const updated = parseUpdatedTimestamp(p.metadata?.updated);
    if (!updated) continue;

    const prev = map.get(sku) ?? null;
    map.set(sku, maxDate(prev, updated)!);
  }

  return map;
}

/** Returns per-category (slug) last modified timestamps from products in section subtree. */
export function getSectionLastModifiedBySlug(): Map<string, Date> {
  const sections = getSectionsRaw();
  const childrenByParent = new Map<number, number[]>();

  for (const s of sections) {
    if (s.parent == null) continue;
    const arr = childrenByParent.get(s.parent) ?? [];
    arr.push(s.id);
    childrenByParent.set(s.parent, arr);
  }

  const ownMaxBySectionId = new Map<number, Date>();
  for (const p of getVisibleProductsRaw()) {
    const updated = parseUpdatedTimestamp(p.metadata?.updated);
    if (!updated) continue;
    const prev = ownMaxBySectionId.get(p.section_id) ?? null;
    ownMaxBySectionId.set(p.section_id, maxDate(prev, updated)!);
  }

  const cache = new Map<number, Date | null>();
  const getSubtreeMax = (sectionId: number): Date | null => {
    if (cache.has(sectionId)) return cache.get(sectionId) ?? null;

    let latest: Date | null = ownMaxBySectionId.get(sectionId) ?? null;
    for (const childId of childrenByParent.get(sectionId) ?? []) {
      latest = maxDate(latest, getSubtreeMax(childId));
    }

    cache.set(sectionId, latest);
    return latest;
  };

  const bySlug = new Map<string, Date>();
  for (const s of sections) {
    const latest = getSubtreeMax(s.id);
    if (latest && s.external_id) {
      bySlug.set(s.external_id, latest);
    }
  }

  return bySlug;
}
