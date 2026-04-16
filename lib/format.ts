/** Format price in BYN with 2 decimal places */
export function formatPrice(price: number, currency = "Br"): string {
  if (price == null || isNaN(price)) return "—";
  return `${price.toFixed(2).replace(".", ",")} ${currency}`;
}

/** Format price without currency symbol */
export function formatPriceValue(price: number): string {
  if (price == null || isNaN(price)) return "—";
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
