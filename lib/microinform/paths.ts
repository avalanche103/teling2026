import path from "path";

export const MICROINFORM_DIR = path.join(process.cwd(), "data", "microinform");
export const SETTINGS_PATH = path.join(MICROINFORM_DIR, "settings.json");
export const STATE_PATH = path.join(MICROINFORM_DIR, "state.json");
export const SECTION_MAP_PATH = path.join(MICROINFORM_DIR, "section-map.json");
export const PRICE_CACHE_PATH = path.join(MICROINFORM_DIR, "price-cache.xls");
export const PRODUCTS_PATH = path.join(process.cwd(), "data", "products.microinform.json");
export const SECTIONS_PATH = path.join(process.cwd(), "data", "sections.json");
export const SSD_PRODUCTS_PATH = path.join(process.cwd(), "data", "products.json");
export const PUBLIC_IMAGES_DIR = path.join(process.cwd(), "public", "images");
