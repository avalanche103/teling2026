import path from "path";

export const CONCEPT_DIR = path.join(process.cwd(), "data", "concept");
export const SETTINGS_PATH = path.join(CONCEPT_DIR, "settings.json");
export const STATE_PATH = path.join(CONCEPT_DIR, "state.json");
export const SECTION_MAP_PATH = path.join(CONCEPT_DIR, "section-map.json");
export const PRICE_CACHE_PATH = path.join(CONCEPT_DIR, "kiwi-price-cache.xls");
export const PRICE_BOOK_CACHE_PATH = path.join(CONCEPT_DIR, "kiwi-price-book.json");
export const EXFO_CACHE_PATH = path.join(CONCEPT_DIR, "exfo-catalog.json");
export const KIWI_URL_MAP_PATH = path.join(CONCEPT_DIR, "kiwi-url-map.json");
export const PRODUCTS_PATH = path.join(process.cwd(), "data", "products.concept.json");
export const SECTIONS_PATH = path.join(process.cwd(), "data", "sections.json");
export const SSD_PRODUCTS_PATH = path.join(process.cwd(), "data", "products.json");
export const MICROINFORM_PRODUCTS_PATH = path.join(
  process.cwd(),
  "data",
  "products.microinform.json",
);
export const PUBLIC_IMAGES_DIR = path.join(process.cwd(), "public", "images");
