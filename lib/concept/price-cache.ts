import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import {
  CONCEPT_DIR,
  PRICE_BOOK_CACHE_PATH,
  PRICE_CACHE_PATH,
} from "./paths";
import { isExcludedKiwiProduct } from "./kiwi-filters";
import { parseKiwiPriceBuffer, type ParsedKiwiPriceBook } from "./parse-kiwi-price";

function withoutExcludedKiwi(book: ParsedKiwiPriceBook): ParsedKiwiPriceBook {
  const products = book.products.filter(
    (p) => !isExcludedKiwiProduct(p.articul, p.name),
  );
  const counts = new Map<string, number>();
  for (const p of products) {
    counts.set(p.sectionTitle, (counts.get(p.sectionTitle) || 0) + 1);
  }
  return {
    ...book,
    products,
    sections: book.sections
      .map((s) => ({ ...s, productCount: counts.get(s.title) || 0 }))
      .filter((s) => s.productCount > 0),
  };
}

function ensureDir(): void {
  if (!existsSync(CONCEPT_DIR)) mkdirSync(CONCEPT_DIR, { recursive: true });
}

export function cacheKiwiPriceFile(buffer: Buffer, sourceName: string): ParsedKiwiPriceBook {
  ensureDir();
  writeFileSync(PRICE_CACHE_PATH, buffer);
  const book = parseKiwiPriceBuffer(buffer, sourceName);
  writeFileSync(PRICE_BOOK_CACHE_PATH, JSON.stringify(book, null, 2), "utf-8");
  return book;
}

export function readCachedKiwiPriceBook(): ParsedKiwiPriceBook | null {
  if (existsSync(PRICE_BOOK_CACHE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(PRICE_BOOK_CACHE_PATH, "utf-8")) as ParsedKiwiPriceBook;
      return withoutExcludedKiwi(raw);
    } catch {
      /* fall through */
    }
  }
  if (!existsSync(PRICE_CACHE_PATH)) return null;
  const buffer = readFileSync(PRICE_CACHE_PATH);
  const book = parseKiwiPriceBuffer(buffer, "kiwi-price-cache.xls");
  writeFileSync(PRICE_BOOK_CACHE_PATH, JSON.stringify(book, null, 2), "utf-8");
  return withoutExcludedKiwi(book);
}
