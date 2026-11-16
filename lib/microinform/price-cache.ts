import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { MICROINFORM_DIR, PRICE_CACHE_PATH } from "./paths";
import { parseMicroinformPriceBuffer, type ParsedPriceBook } from "./parse-price";

const PARSED_CACHE_PATH = path.join(MICROINFORM_DIR, "price-parsed.json");

export async function fetchAndCachePrice(priceUrl: string): Promise<ParsedPriceBook> {
  if (!existsSync(MICROINFORM_DIR)) mkdirSync(MICROINFORM_DIR, { recursive: true });

  const res = await fetch(priceUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TelingBot/1.0; +https://teling.by)",
      Accept: "application/vnd.ms-excel,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) {
    throw new Error(`Не удалось скачать прайс: HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(PRICE_CACHE_PATH, buffer);

  const book = parseMicroinformPriceBuffer(buffer);
  writeFileSync(PARSED_CACHE_PATH, JSON.stringify(book), "utf-8");
  return book;
}

export function readCachedPriceBook(): ParsedPriceBook | null {
  // Always re-parse from the binary .xls when present so encoding fixes apply
  // even if an older UTF-mojibake JSON cache is on disk.
  if (existsSync(PRICE_CACHE_PATH)) {
    const buffer = readFileSync(PRICE_CACHE_PATH);
    const book = parseMicroinformPriceBuffer(buffer);
    writeFileSync(PARSED_CACHE_PATH, JSON.stringify(book), "utf-8");
    return book;
  }
  if (existsSync(PARSED_CACHE_PATH)) {
    return JSON.parse(readFileSync(PARSED_CACHE_PATH, "utf-8")) as ParsedPriceBook;
  }
  return null;
}
