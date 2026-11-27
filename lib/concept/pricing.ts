const VAT_RATE = 0.2;

/** Ceiling to VAT-friendly BYN amount (step 6 / 0.6), same idea as SSD export. */
export function roundPriceForVat(priceByn: number): number {
  if (!Number.isFinite(priceByn) || priceByn <= 0) return 0;
  const step = priceByn >= 20 ? 6 : 0.6;
  const rounded = Math.ceil(priceByn / step - 1e-9) * step;
  const quant = rounded >= 20 ? 1 : 0.1;
  return Number((Math.round(rounded / quant) * quant).toFixed(2));
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

export function computeConceptPrice(
  usd: number,
  usdToBynRate: number,
  markupPercent: number,
): { price: number; priceWithoutVat: number; vatAmount: number; raw: number } {
  const rate = Number.isFinite(usdToBynRate) && usdToBynRate > 0 ? usdToBynRate : 0;
  const markup = Number.isFinite(markupPercent) ? markupPercent : 0;
  if (!Number.isFinite(usd) || usd <= 0 || rate <= 0) {
    return { price: 0, priceWithoutVat: 0, vatAmount: 0, raw: 0 };
  }
  const raw = usd * rate * (1 + markup / 100);
  const price = roundPriceForVat(raw);
  const { priceWithoutVat, vatAmount } = splitVat(price);
  return { price, priceWithoutVat, vatAmount, raw };
}
