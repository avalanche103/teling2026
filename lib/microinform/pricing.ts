const VAT_RATE = 0.2;

/** Ceiling to whole BYN rubles. */
export function ceilByn(price: number): number {
  if (!Number.isFinite(price) || price <= 0) return 0;
  return Math.ceil(price);
}

export function applyMarkup(priceA: number, markupPercent: number): number {
  const markup = Number.isFinite(markupPercent) ? markupPercent : 0;
  return priceA * (1 + markup / 100);
}

export function splitVat(priceByn: number): { priceWithoutVat: number; vatAmount: number } {
  if (!Number.isFinite(priceByn) || priceByn <= 0) {
    return { priceWithoutVat: 0, vatAmount: 0 };
  }
  const quant = priceByn >= 20 ? 1 : 0.1;
  const rawWithout = priceByn / (1 + VAT_RATE);
  const priceWithoutVat = Math.round(rawWithout / quant) * quant;
  const vatAmount = Math.round((priceByn - priceWithoutVat) / quant) * quant;
  return {
    priceWithoutVat: Number(priceWithoutVat.toFixed(2)),
    vatAmount: Number(vatAmount.toFixed(2)),
  };
}

export function computeMicroinformPrice(
  priceA: number,
  markupPercent: number,
): { price: number; priceWithoutVat: number; vatAmount: number } {
  const price = ceilByn(applyMarkup(priceA, markupPercent));
  const { priceWithoutVat, vatAmount } = splitVat(price);
  return { price, priceWithoutVat, vatAmount };
}

/** Parse BYN number from Microinform XLS text like "1 084,61". */
export function parseBynNumber(raw: string): number | null {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/\u00a0/g, "")
    .replace(",", ".")
    .trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}
