/**
 * Normalize SSD (and other) product "Цвет" characteristic values so filters
 * do not explode into RAL / case / gender duplicates.
 */

const COLOR_NAMES = new Set([
  "цвет",
  "цвет корпуса",
  "цвет покрытия",
  "окраска",
  "расцветка",
]);

export function isColorCharName(name: string | undefined | null): boolean {
  const n = (name || "").trim().toLowerCase();
  return COLOR_NAMES.has(n);
}

function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripBullets(value: string): string {
  return value.replace(/^[\s•·●\-–—]+/g, "").trim();
}

/** Map adjective/gender endings to masculine dictionary form where safe. */
function baseColorWord(token: string): string | null {
  const t = token
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]/gi, "");
  const map: Record<string, string> = {
    серый: "Серый",
    серая: "Серый",
    серое: "Серый",
    серые: "Серый",
    gray: "Серый",
    grey: "Серый",
    черный: "Черный",
    черная: "Черный",
    черное: "Черный",
    черные: "Черный",
    black: "Черный",
    белый: "Белый",
    белая: "Белый",
    белое: "Белый",
    белые: "Белый",
    white: "Белый",
    красный: "Красный",
    красная: "Красный",
    красное: "Красный",
    красные: "Красный",
    red: "Красный",
    синий: "Синий",
    синяя: "Синий",
    синее: "Синий",
    синие: "Синий",
    blue: "Синий",
    желтый: "Желтый",
    желтая: "Желтый",
    желтое: "Желтый",
    желтые: "Желтый",
    yellow: "Желтый",
    оранжевый: "Оранжевый",
    оранжевая: "Оранжевый",
    оранжевое: "Оранжевый",
    оранжевые: "Оранжевый",
    зеленый: "Зеленый",
    зеленая: "Зеленый",
    зеленое: "Зеленый",
    зеленые: "Зеленый",
    green: "Зеленый",
    прозрачный: "Прозрачный",
    прозрачная: "Прозрачный",
    прозрачное: "Прозрачный",
    коричневый: "Коричневый",
    коричневая: "Коричневый",
  };
  return map[t] || null;
}

function extractRal(raw: string): string | null {
  const m = raw.match(/\bRAL\s*([0-9]{3,4})\b/i) || raw.match(/\b(7035|9005|9003|9010|9016)\b/);
  if (!m) return null;
  return m[1];
}

/**
 * Canonical color label for filters / product cards.
 * Returns null for junk values that should not appear as color facets.
 */
export function normalizeColorValue(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let value = stripBullets(collapseSpaces(String(raw)));
  if (!value) return null;

  // Drop obvious non-colors that leaked into Цвет.
  if (/^\d+$/.test(value)) return null;
  if (/^\d+\s*[xх×]\s*\d+/i.test(value)) return null;
  if (/не более/i.test(value)) return null;
  if (/^нет$/i.test(value)) return null;
  if (/комплект/i.test(value)) return null;
  if (/жки|точек с подсвет/i.test(value)) return null;

  const lower = value.toLowerCase().replace(/ё/g, "е");
  const ral = extractRal(value);

  // Fold any RAL mention into a plain color — never keep "RAL …" in filters.
  if (ral || /\bral\b/i.test(value)) {
    if (ral === "7035" || /сер/i.test(lower)) return "Серый";
    if (ral === "9005" || /черн/i.test(lower)) return "Черный";
    if (ral === "9003" || ral === "9010" || ral === "9016" || /бел/i.test(lower)) {
      return "Белый";
    }
    if (/красн/i.test(lower)) return "Красный";
    if (/син/i.test(lower)) return "Синий";
    // Bare / unknown RAL code — hide from color facets.
    return null;
  }

  // Multi-color phrases — lightly normalize casing of known parts.
  if (/[\/,]/.test(value) || /-/.test(value) || /\sс\s/i.test(value)) {
    // Keep informative multi-color labels, just tidy ё/case of first word when whole value is simple.
    const cleaned = value
      .replace(/ё/g, "е")
      .replace(/Ё/g, "Е");
    // Known fixed phrases
    const phraseMap: Record<string, string> = {
      "черный с красными полосами": "Черный с красными полосами",
      "красный с синими полосами": "Красный с синими полосами",
      "белый с различными оттенками": "Белый с различными оттенками",
      "натурального светлого цвета": "Натуральный светлый",
      "синего цвета": "Синий",
      "красно-белый": "Красно-белый",
      "красно-белая": "Красно-белый",
      "оранжево-белый": "Оранжево-белый",
      "красно-черный": "Красно-черный",
      "черно-желтая": "Черно-желтый",
      "черно-желтый": "Черно-желтый",
      "бело-красный": "Бело-красный",
      "бело-черный": "Бело-черный",
      "бело-синий": "Бело-синий",
      "желто-красный": "Желто-красный",
      "желто-зелёный": "Желто-зеленый",
      "желто-зеленый": "Желто-зеленый",
      "черный, серый": "Черный / Серый",
      "серый, бежевый": "Серый / Бежевый",
      "натуральный или серый": "Натуральный / Серый",
      "серый (gray)": "Серый",
      "черный (black)": "Черный",
      "серый ral 7035": "Серый",
      "черный ral 9005": "Черный",
    };
    const key = cleaned.toLowerCase();
    if (phraseMap[key]) return phraseMap[key];
    // Title-case first letter only for leftover phrases
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  const single = baseColorWord(value);
  if (single) return single;

  // "Серый RAL …" already handled; leftover single tokens
  if (/^серый\b/i.test(lower)) return "Серый";
  if (/^черн/i.test(lower)) return "Черный";
  if (/^бел/i.test(lower)) return "Белый";

  return value.charAt(0).toUpperCase() + value.slice(1);
}
