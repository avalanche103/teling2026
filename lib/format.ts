/** Check whether a price is available for display */
export function hasPrice(price: number | null | undefined): price is number {
  return typeof price === "number" && !isNaN(price) && price > 0;
}

export function normalizeCurrency(currency: string | null | undefined): string {
  if (!currency) return "BYN";
  return currency === "Br" ? "BYN" : currency;
}

/** Format price with 2 decimal places */
export function formatPrice(price: number | null | undefined, currency = "BYN"): string {
  if (!hasPrice(price)) return "По запросу";
  return `${price.toFixed(2).replace(".", ",")} ${normalizeCurrency(currency)}`;
}

/** Format price without currency symbol */
export function formatPriceValue(price: number | null | undefined): string {
  if (!hasPrice(price)) return "По запросу";
  return price.toFixed(2).replace(".", ",");
}

/** Phone number formatter: keeps +375 (17) 270-50-95 as-is */
export function normalizePhone(phone: string): string {
  return phone.trim();
}

/** Convert slug to readable breadcrumb text */
export function slugToTitle(slug: string): string {
  return slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

/** Truncate text to maxLength with ellipsis */
export function truncate(text: string, maxLength = 120): string {
  if (!text || text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "…";
}

/** Strip HTML tags for plain-text previews */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
}
