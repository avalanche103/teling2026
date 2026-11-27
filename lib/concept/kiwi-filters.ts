/**
 * KIWI rows we do not publish:
 * - SFP/SFP+ modules
 * - tool kits only (KIWI-KIT-STD / FTTH / CLN …) — instrument “KIT 1/2” configs stay
 */
export function isExcludedKiwiProduct(articul: string, name = ""): boolean {
  const art = articul.replace(/\s+/g, " ").trim();
  const blob = `${art} ${name}`.replace(/\s+/g, " ").trim();
  if (!blob) return false;
  if (/\bSFP\+?\b/i.test(blob) || /KW-SFP/i.test(blob)) return true;
  // Tool kits use the KIWI-KIT-* articul family (монтаж / FTTH / очистка).
  if (/KIWI-KIT[-_]/i.test(art) || /^KIT[-_](STD|FTTH|CLN)\b/i.test(art)) return true;
  if (
    /\bKIT\b/i.test(blob) &&
    /комплект.*(?:монтаж|очистк|инструмент)|мини-комплект\s+монтажника|набор\s+для\s+очистк/i.test(
      blob,
    )
  ) {
    return true;
  }
  return false;
}
