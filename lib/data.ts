import path from "path";
import { readFileSync } from "fs";
import type {
  SectionRaw,
  ProductRaw,
  Category,
  Product,
  ProductSummary,
} from "./types";

// ---- Module-level lazy caches ----

let _sections: SectionRaw[] | null = null;
let _products: ProductRaw[] | null = null;
let _categoryTree: Category[] | null = null;
let _productsBySkuMap: Map<string, ProductRaw> | null = null;
let _productsBySectionMap: Map<number, ProductRaw[]> | null = null;
let _sectionBySlugMap: Map<string, SectionRaw> | null = null;
let _sectionSlugByIdMap: Map<number, string> | null = null;

function getSectionsRaw(): SectionRaw[] {
  if (!_sections) {
    const filePath = path.join(process.cwd(), "data", "sections.json");
    _sections = JSON.parse(readFileSync(filePath, "utf-8")) as SectionRaw[];
  }
  return _sections;
}

function getProductsRaw(): ProductRaw[] {
  if (!_products) {
    const filePath = path.join(process.cwd(), "data", "products.json");
    _products = JSON.parse(readFileSync(filePath, "utf-8")) as ProductRaw[];
  }
  return _products;
}

function getSectionBySlugMap(): Map<string, SectionRaw> {
  if (!_sectionBySlugMap) {
    _sectionBySlugMap = new Map();
    for (const s of getSectionsRaw()) {
      _sectionBySlugMap.set(s.external_id, s);
    }
  }
  return _sectionBySlugMap;
}

function getSectionSlugByIdMap(): Map<number, string> {
  if (!_sectionSlugByIdMap) {
    _sectionSlugByIdMap = new Map();
    for (const s of getSectionsRaw()) {
      _sectionSlugByIdMap.set(s.id, s.external_id);
    }
  }
  return _sectionSlugByIdMap;
}

function getLocalImageUrls(sku: string): string[] {
  const imagesDir =
    process.env.IMAGES_DIR || path.join(process.cwd(), "public", "images");
  const extensions = ["webp", "jpg", "jpeg", "png"];
  const found: string[] = [];

  for (let i = 1; i <= 8; i += 1) {
    let matched = false;
    for (const ext of extensions) {
      const filename = `${sku}_${i}.${ext}`;
      const abs = path.join(imagesDir, filename);
      try {
        readFileSync(abs, { encoding: null });
        found.push(`/image/${encodeURIComponent(filename)}`);
        matched = true;
        break;
      } catch {
        // File doesn't exist or cannot be read.
      }
    }

    // Stop scanning when the sequence is broken after at least one image found.
    if (!matched && found.length > 0) {
      break;
    }
  }

  return found;
}

function getProductsBySkuMap(): Map<string, ProductRaw> {
  if (!_productsBySkuMap) {
    _productsBySkuMap = new Map();
    for (const p of getProductsRaw()) {
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
    for (const p of getProductsRaw()) {
      const arr = _productsBySectionMap.get(p.section_id) ?? [];
      arr.push(p);
      _productsBySectionMap.set(p.section_id, arr);
    }
  }
  return _productsBySectionMap;
}

// ---- Category tree ----

function buildCategoryTree(sections: SectionRaw[]): Category[] {
  const map = new Map<number, Category>();
  for (const s of sections) {
    map.set(s.id, {
      id: s.id,
      name: s.name,
      slug: s.external_id,
      parentId: s.parent,
      level: s.metadata?.level ?? 1,
      imageUrl: s.metadata?.picture ?? null,
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

function rawToSummary(p: ProductRaw): ProductSummary {
  const sectionSlug = getSectionSlugByIdMap().get(p.section_id) || "";
  const sku = typeof p.sku === "string" ? p.sku : "";
  const name =
    typeof p.name === "string" && p.name.trim()
      ? p.name
      : typeof p.original_name === "string" && p.original_name.trim()
      ? p.original_name
      : "Без названия";
  const localImages = sku ? getLocalImageUrls(sku) : [];
  return {
    id: p.id,
    name,
    sku,
    sectionId: p.section_id,
    sectionName: p.section_name,
    sectionSlug,
    price: p.price,
    currency: p.currency,
    currencyCode: p.currency_code,
    brand: p.metadata?.brand || p.vendor || "",
    unit: p.metadata?.unit || "шт",
    type: p.metadata?.type || "",
    thumbnail: localImages[0] ?? null,
  };
}

function rawToProduct(p: ProductRaw): Product {
  const localImages = getLocalImageUrls(p.sku);
  return {
    ...rawToSummary(p),
    priceWithoutVat: p.price_without_vat,
    vatAmount: p.vat_amount,
    timeDelivery: p.metadata?.timeDelivery || "",
    weight: p.metadata?.weight || 0,
    volume: p.metadata?.volume || 0,
    localImages,
    externalImages: [],
    video: p.metadata?.video || [],
    documents: p.metadata?.documents || [],
    relatedSkus: p.metadata?.soputst || [],
    analogSkus: p.metadata?.analog || [],
    replacementSkus: p.metadata?.zamena || [],
    chars: p.metadata?.chars || [],
    description: p.metadata?.description || "",
    externalUrl: p.metadata?.url || "",
    minQty: p.metadata?.minQty || 1,
    updatedAt: p.metadata?.updated || "",
  };
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
  } = options;

  const bySection = getProductsBySectionMap();
  let allProducts: ProductRaw[] = [];

  if (includeDescendants) {
    const cat = getCategoryById(sectionId);
    const ids = cat ? getAllDescendantIds(cat) : [sectionId];
    for (const id of ids) {
      allProducts.push(...(bySection.get(id) ?? []));
    }
  } else {
    allProducts = bySection.get(sectionId) ?? [];
  }

  if (search) {
    const q = search.toLowerCase();
    allProducts = allProducts.filter(
      (p) => {
        const name = typeof p.name === "string" ? p.name.toLowerCase() : "";
        const sku = typeof p.sku === "string" ? p.sku.toLowerCase() : "";
        const brand = (p.metadata?.brand || "").toLowerCase();
        return name.includes(q) || sku.includes(q) || brand.includes(q);
      }
    );
  }

  // Items without SKU cannot be opened in product route, hide them from UI listings.
  allProducts = allProducts.filter(
    (p) => typeof p.sku === "string" && p.sku.trim().length > 0
  );

  const total = allProducts.length;
  const start = (page - 1) * limit;
  const slice = allProducts.slice(start, start + limit);
  return { products: slice.map(rawToSummary), total };
}

export function searchProducts(
  query: string,
  limit = 24
): ProductSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const variants = buildSearchVariants(q);
  const scored: Array<{ p: ProductRaw; score: number }> = [];

  for (const p of getProductsRaw()) {
    const sku = normalizeForSearch(typeof p.sku === "string" ? p.sku : "");
    const name = normalizeForSearch(typeof p.name === "string" ? p.name : "");
    const brand = normalizeForSearch(p.metadata?.brand || "");

    // Product route requires SKU; skip broken data rows from search results.
    if (!sku) continue;

    let bestScore = 0;

    for (const term of variants) {
      if (!term) continue;

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

      if (brand.includes(term)) {
        bestScore = Math.max(bestScore, 30 + Math.min(term.length, 6));
      }
    }

    if (bestScore > 0) {
      scored.push({ p, score: bestScore });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.p.id - b.p.id;
  });

  return scored.slice(0, limit).map((x) => rawToSummary(x.p));
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/g, " ")
    .trim();
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

/** Returns all section external_ids (slugs) for static params generation */
export function getAllSectionSlugs(): string[] {
  return getSectionsRaw().map((s) => s.external_id).filter(Boolean);
}

/** Returns all product SKUs for static params generation */
export function getAllProductSkus(): string[] {
  return getProductsRaw()
    .map((p) => (typeof p.sku === "string" ? p.sku.trim() : ""))
    .filter(Boolean);
}
