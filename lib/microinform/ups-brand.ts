/**
 * Infer brand for UPS-related SSD rows where metadata.brand / vendor are empty.
 * Shared sections (519/520/508/…) mix SSD + Microinform catalogs.
 */
export function inferUpsBrand(input: {
  name?: string;
  vendor?: string | null;
  brand?: string | null;
  articul?: string | null;
}): string {
  const existing = (input.brand || input.vendor || "").trim();
  if (existing && !/^noname$/i.test(existing) && existing.toLowerCase() !== "ссд") {
    // Keep real brands; "ССД" on PDUs is a supplier placeholder — try name first.
    if (existing.toLowerCase() !== "ссд") return existing;
  }

  const hay = `${input.name || ""} ${input.articul || ""} ${existing}`.replace(/\s+/g, " ");

  const rules: Array<{ re: RegExp; brand: string }> = [
    { re: /\bINFORMIX\b/i, brand: "INFORMIX" },
    { re: /\bSVC\b/i, brand: "SVC" },
    { re: /Systeme\s*Electric|Schneider/i, brand: "Systeme Electric" },
    { re: /\bSKAT\b/i, brand: "SKAT" },
    { re: /\bInfo\b|INFOLCD|INFOPDU|INFO\d/i, brand: "Info" },
    { re: /\bTrio\b|TRIOTT/i, brand: "Trio" },
    { re: /\bSolo\b|SOLOMD|SOLO\d/i, brand: "Solo" },
    { re: /\bSmall\b|SMALLT|SMALLR/i, brand: "Small" },
    { re: /\bVektor\b|\bGP\s*12-|\bGPL\s*12-/i, brand: "Vektor" },
    { re: /\bDelta\b/i, brand: "Delta" },
    { re: /\bITK\b/i, brand: "ITK" },
    { re: /\bHyperline\b/i, brand: "Hyperline" },
    { re: /\bCabeus\b/i, brand: "Cabeus" },
    { re: /\bREXANT\b/i, brand: "REXANT" },
    { re: /\bAPC\b/i, brand: "APC" },
    { re: /\bCSB\b/i, brand: "CSB" },
    { re: /\bATEN\b/i, brand: "ATEN" },
    { re: /\bENERGIZER\b/i, brand: "ENERGIZER" },
  ];

  for (const rule of rules) {
    if (rule.re.test(hay)) return rule.brand;
  }

  if (existing) return existing;
  return "";
}
