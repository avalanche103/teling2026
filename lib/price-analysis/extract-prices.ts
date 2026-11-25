/** Strip HTML tags and decode a few common entities from SERP snippets. */
export function cleanSnippetText(raw: string): string {
  return String(raw || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract money-like amounts from SERP text (BYN / Br / руб / bare decimals).
 * Prefers amounts near currency markers; also picks standalone "1 234,56" patterns.
 */
export function extractPricesFromText(text: string): number[] {
  const cleaned = cleanSnippetText(text);
  if (!cleaned) return [];

  const found = new Set<number>();

  const withCurrency =
    /(?:BYN|Br|бел\.?\s*руб\.?|руб\.?|р\.)\s*([0-9]{1,3}(?:[\s\u00a0][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)|([0-9]{1,3}(?:[\s\u00a0][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)\s*(?:BYN|Br|бел\.?\s*руб\.?|руб\.?|р\.)/gi;

  let match: RegExpExecArray | null;
  while ((match = withCurrency.exec(cleaned)) !== null) {
    const raw = match[1] || match[2];
    const value = parseMoney(raw);
    if (value != null) found.add(value);
  }

  // Bare amounts like 1 084,61 or 1084.50 when currency is elsewhere in the snippet
  const bare =
    /(?<![A-Za-z0-9./-])([0-9]{1,3}(?:[\s\u00a0][0-9]{3})+[.,][0-9]{2}|[0-9]{2,6}[.,][0-9]{2})(?![A-Za-z0-9./-])/g;
  while ((match = bare.exec(cleaned)) !== null) {
    const value = parseMoney(match[1]);
    if (value != null) found.add(value);
  }

  return [...found];
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const normalized = raw
    .replace(/[\s\u00a0]/g, "")
    .replace(",", ".")
    .trim();
  if (!normalized) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) return null;
  // Ignore tiny noise and absurd catalog outliers
  if (value < 1 || value > 1_000_000) return null;
  return Number(value.toFixed(2));
}

/**
 * Drop outlier prices far from our shelf price (and from the median of candidates).
 */
export function filterValidPrices(
  prices: number[],
  ourPrice: number,
): number[] {
  const unique = [...new Set(prices.filter((p) => Number.isFinite(p) && p > 0))].sort(
    (a, b) => a - b,
  );
  if (unique.length === 0) return [];

  const ref = ourPrice > 0 ? ourPrice : unique[Math.floor(unique.length / 2)];
  // 0.5× cuts obvious snippet junk (accessories / wrong currency) while
  // still allowing real discounts vs our shelf price.
  const low = ref * 0.5;
  const high = ref * 4;

  let filtered = unique.filter((p) => p >= low && p <= high);
  if (filtered.length === 0) filtered = unique;

  if (filtered.length >= 3) {
    const mid = filtered[Math.floor(filtered.length / 2)];
    filtered = filtered.filter((p) => p >= mid * 0.4 && p <= mid * 2.5);
  }

  return filtered;
}

export function suggestMinPrice(validPrices: number[]): number | null {
  if (!validPrices.length) return null;
  return Math.min(...validPrices);
}
