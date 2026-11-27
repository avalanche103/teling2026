/** Brands that must come from Concept Technology, not SSD. */
export const CONCEPT_OWNED_BRANDS = ["KIWI", "EXFO"] as const;

export function normalizeBrandToken(value: string | null | undefined): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function isConceptOwnedBrand(
  vendor?: string | null,
  brand?: string | null,
  name?: string | null,
): boolean {
  const tokens = [vendor, brand]
    .map((v) => normalizeBrandToken(v))
    .filter(Boolean);
  for (const token of tokens) {
    if (CONCEPT_OWNED_BRANDS.some((b) => token === b || token.startsWith(`${b} `))) {
      return true;
    }
  }
  const blob = normalizeBrandToken(name);
  if (!blob) return false;
  // Name-only match: brand token as a whole word near the start / as KIWI-#### pattern.
  if (/\bEXFO\b/.test(blob)) return true;
  if (/\bKIWI(?:-|\b)/.test(blob)) return true;
  return false;
}
