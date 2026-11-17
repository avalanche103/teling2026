/** D-Link hardware revision codes: A1A, B1A, F1A, FL2A, F3A, A2B, B1R, … */
export function isDlinkHwRevision(segment: string): boolean {
  return /^[A-Z]{1,3}\d[A-Z0-9]{0,3}$/i.test(segment.trim());
}

/**
 * For D-Link, ignore trailing hardware revision after `/`
 * (manufacturer pages do not distinguish F1A vs FL2A).
 * Keep meaningful mid-path parts (ME, 10KM, 40KM, …).
 */
export function normalizeMicroinformArticul(vendor: string, articul: string): string {
  const raw = String(articul || "").trim();
  if (!raw) return raw;
  if (!/^d-?link$/i.test(vendor || "")) return raw;

  const parts = raw.split("/").map((p) => p.trim()).filter(Boolean);
  while (parts.length > 1 && isDlinkHwRevision(parts[parts.length - 1]!)) {
    parts.pop();
  }
  return parts.join("/");
}

/** Remove `/F1A`-style (and trailing `/A`, `/B`) revision tokens from product titles. */
export function stripDlinkRevisionsFromText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\/([A-Z]{1,3}\d[A-Z0-9]{0,3})\b/gi, "")
    // Old D-Link cards title hardware letters as DES-1008P/A or DGS-1008A/B.
    .replace(/\/[A-Z]\b/gi, "")
    .replace(/\bEOL\b/gi, "")
    .replace(/\bEOS\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+,/g, ",")
    .replace(/\/{2,}/g, "/")
    .trim()
    .replace(/\/$/g, "");
}
