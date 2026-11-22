import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from "fs";
import { pipeline } from "stream/promises";
import path from "path";
import { Readable } from "stream";
import * as cheerio from "cheerio";
import type { ProductCharGroup, ProductDocument, ProductRaw } from "@/lib/types";
import { normalizeMicroinformArticul } from "./articul";
import { getManufacturerIndex, lookupManufacturerEntry } from "./manufacturer";
import { PUBLIC_IMAGES_DIR } from "./paths";
import { readMicroinformProducts, writeMicroinformProducts } from "./store";
import {
  refineActiveNetworkChars,
  resolveActiveNetworkGroup,
} from "./chars";
import { downloadFileViaCurl, fetchTextWithCurlFallback } from "./http-fetch";
import { processMicroinformPackshot } from "./knockout-bg";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_IMAGES = 8;

function absoluteUrl(base: string, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Unwrap Nuxt/_ipx image proxies used by systeme.ru. */
function unwrapImageUrl(href: string): string {
  const raw = (href || "").trim();
  if (!raw) return raw;
  const ipx = raw.match(/\/_ipx\/[^/]+\/(https?:\/\/.+)$/i);
  if (ipx?.[1]) return ipx[1];
  const embedded = raw.match(/(https?:\/\/static\.systeme\.ru\/catalog\/images\/[^"'?\s]+)/i);
  if (embedded?.[1]) return embedded[1];
  return raw;
}

function absolutizeHtml(pageUrl: string, html: string): string {
  const $ = cheerio.load(`<div id="teling-root">${html}</div>`, false);
  $("#teling-root [src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const abs = absoluteUrl(pageUrl, src);
    if (abs) $(el).attr("src", abs);
  });
  $("#teling-root [href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || href.startsWith("#")) return;
    const abs = absoluteUrl(pageUrl, href);
    if (abs) $(el).attr("href", abs);
  });
  return ($("#teling-root").html() || "").trim();
}

function scrubInlineStyle(style: string): string {
  const keep: string[] = [];
  for (const part of style.split(";")) {
    const decl = part.trim();
    if (!decl) continue;
    const prop = decl.split(":")[0]?.trim().toLowerCase() || "";
    // Drop vendor typography/color so site Onest rules are not overridden.
    if (
      prop.startsWith("font") ||
      prop === "color" ||
      prop === "line-height" ||
      prop === "letter-spacing" ||
      prop === "text-transform" ||
      prop === "background" ||
      prop === "background-color"
    ) {
      continue;
    }
    keep.push(decl);
  }
  return keep.join("; ");
}

function sanitizeHtml(pageUrl: string, html: string): string {
  const wrapped = absolutizeHtml(pageUrl, html);
  const $ = cheerio.load(`<div id="teling-root">${wrapped}</div>`, false);
  $("#teling-root script, #teling-root style, #teling-root iframe, #teling-root object, #teling-root embed").remove();
  // Unwrap <font> — it only carries size/face from manufacturer pages.
  $("#teling-root font").each((_, el) => {
    $(el).replaceWith($(el).html() || "");
  });
  $("#teling-root *").each((_, el) => {
    const attribs = ("attribs" in el ? (el.attribs as Record<string, string>) : {}) || {};
    for (const name of Object.keys(attribs)) {
      if (
        name.startsWith("on") ||
        name === "srcdoc" ||
        name === "face" ||
        name === "size" ||
        name === "color"
      ) {
        $(el).removeAttr(name);
        continue;
      }
      if (name === "style") {
        const cleaned = scrubInlineStyle(attribs.style || "");
        if (cleaned) $(el).attr("style", cleaned);
        else $(el).removeAttr("style");
      }
    }
  });
  return ($("#teling-root").html() || "").trim();
}

function guessDocType(name: string, href: string): string {
  const blob = `${name} ${href}`.toLowerCase();
  if (blob.includes("sert") || blob.includes("cert") || blob.includes("сертиф") || blob.includes("еаэс")) {
    return "Сертификат";
  }
  if (blob.includes("qig") || blob.includes("install") || blob.includes("руковод") || blob.includes("manual")) {
    return "Инструкция";
  }
  if (blob.includes("data_sh") || blob.includes("datasheet") || blob.includes("ds_") || blob.includes("описан")) {
    return "Datasheet";
  }
  if (href.toLowerCase().endsWith(".pdf")) return "PDF";
  return "Документ";
}

function isListingPrevImage(url: string): boolean {
  // D-Link category thumbs: *_prev.jpg or angled *_x.jpg (not min_ gallery thumbs).
  return /\/up\/prod\/min\/[^/?#]+(?:_prev|_x)\.(jpe?g|png|webp|gif)(\?|$)/i.test(url);
}

function isLikelyProductImage(url: string): boolean {
  const u = url.toLowerCase();
  if (u.includes("logo") || u.includes("icon") || u.includes("favicon") || u.includes("award")) return false;
  // Category listing *_prev.jpg / *_x.jpg is often the only angled packshot.
  if (isListingPrevImage(url)) return true;
  if (u.includes("/min/") || u.includes("mini_") || u.includes("/min_")) return false;
  if (u.includes("/i/") && !u.includes("prod") && !u.includes("iblock")) return false;
  // Diagrams / install collages from support sections are usually not the hero shot.
  if (/\/support\/.*ant\d/i.test(u)) return false;
  if (/\/upload\/iblock\//i.test(u)) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u);
}

/** Higher score = better as the main storefront photo. */
function scoreProductImage(url: string): number {
  const u = url.toLowerCase();
  let score = 0;

  // D-Link angled packshot (/up/prod/600/) must beat flat Front studio shots.
  // Origo often mirrors a flat _1 into /600/ — demote those numbered copies.
  if (u.includes("/up/prod/600/")) {
    if (/\/up\/prod\/600\/[^/?#]+_\d+\.(jpe?g|png|webp|gif)/i.test(u)) score += 40;
    else score += 220;
  } else if (isListingPrevImage(url)) {
    // Listing prev is angled; prefer over Front-only /600/ cards.
    score += 210;
  } else if (u.includes("assets.aten.com/product/image/")) {
    // ATEN hero packshot CDN.
    score += 230;
  } else if (u.includes("assets.aten.com/product/overview/")) {
    if (/icon|feature|model-name|logo/i.test(u)) score += 20;
    else score += 120;
  } else if (u.includes("assets.aten.com/")) {
    score += 90;
  } else if (u.includes("static.systeme.ru/catalog/images/")) {
    score += 200;
  } else if (u.includes("svc.ru") && /\.(jpe?g|png|webp)(\?|$)/i.test(u)) {
    score += 180;
  } else if (/\/upload\/iblock\//i.test(u)) {
    score += 170;
  } else if (u.includes("/up/prod_fotos/")) score += 100;
  else if (u.includes("/up/prod/")) score += 70;
  else if (u.includes("/prod_fotos/")) score += 80;

  // Gallery angles are useful, but Front (even under /600/) is not the preferred hero.
  if (/_front\b|front\d*\.|\/front|\bfront_/i.test(u)) {
    score -= u.includes("/up/prod/600/") ? 160 : 80;
  } else if (/_side|_left|_right/i.test(u) && u.includes("/up/prod/600/")) {
    score += 25;
  }
  // Origo numbered gallery: _2 / _02 angled; _1 / _01 / _1- flat ports/front.
  if (/\/(?:up\/)?prod_fotos\/[^/?#]+_0?2(?:[-_]*)\.(jpe?g|png|webp|gif)/i.test(u)) score += 90;
  else if (/\/(?:up\/)?prod_fotos\/[^/?#]+_0?1(?:[-_]*)\.(jpe?g|png|webp|gif)/i.test(u)) score += 5;
  else if (/_0?1(?:[-_]*)\.(jpe?g|png|webp|gif)/i.test(u)) score += 5;
  if (/_side|_back|_bottom|_top|_rear/i.test(u)) score += 10;
  if (u.includes("/support/")) score -= 50;
  if (u.includes("diagram") || u.includes("schema") || u.includes("install")) score -= 40;
  if (u.includes("banner") || u.includes("promo")) score -= 30;
  if (u.includes("min_") || u.includes("thumb") || u.includes("small")) score -= 40;

  return score;
}

/** Catalog packshots from /up/prod/600/ are often 6–15KB JPEG. */
function minImageBytes(url: string): number {
  if (/\/up\/prod\/600\//i.test(url)) return 3_500;
  if (isListingPrevImage(url)) return 8_000;
  if (/assets\.aten\.com\/product\/image\//i.test(url)) return 4_000;
  if (/static\.systeme\.ru\/catalog\/images\//i.test(url)) return 4_000;
  if (/svc\.ru/i.test(url)) return 4_000;
  return 12_000;
}

function rankProductImages(urls: string[]): string[] {
  const unique = [...new Set(urls)];
  return unique
    .map((url, index) => ({ url, index, score: scoreProductImage(url) }))
    .filter((item) => item.score >= 50) // keep studio/product shots; drop support clutter
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.url)
    .slice(0, MAX_IMAGES);
}

function clearLocalSkuImages(sku: string): void {
  if (!existsSync(PUBLIC_IMAGES_DIR)) return;
  const prefix = `${sku}_`;
  for (const name of readdirSync(PUBLIC_IMAGES_DIR)) {
    if (name.startsWith(prefix)) {
      try {
        unlinkSync(path.join(PUBLIC_IMAGES_DIR, name));
      } catch {
        /* ignore */
      }
    }
  }
}

function isFrontHero(url: string): boolean {
  return /_front\b|front\d*\.|\/front|\bfront_/i.test(url);
}

function isOrigoFlatHero(url: string): boolean {
  // Prefer *_2 / *_02 over flat *_1 / *_01 packshots.
  return /origo/i.test(url) && /_(?:0?1)(?:[-_]*)\.(jpe?g|png|webp|gif)/i.test(url);
}

function firstPictureNeedsRefresh(pictures: string[] | undefined): boolean {
  const first = pictures?.[0] || "";
  if (!first) return true;
  if (/\/support\//i.test(first)) return true;
  if (isFrontHero(first) || isOrigoFlatHero(first)) return true;
  if (/\/up\/prod\/600\//i.test(first)) return false;
  if (isListingPrevImage(first)) return false;
  const score = scoreProductImage(first);
  return score < 80;
}

function pickDescription($: ReturnType<typeof cheerio.load>, pageUrl: string): string {
  const candidates: string[] = [];

  const push = (html: string | null | undefined) => {
    if (!html) return;
    // Drop EOL "recommended replacement" banner tables before sanitize.
    const $frag = cheerio.load(`<div id="teling-desc">${html}</div>`, false);
    $frag("#teling-desc table").each((_, el) => {
      const t = $frag(el).text().replace(/\s+/g, " ").trim();
      if (/^рекомендованная\s+замена/i.test(t)) $frag(el).remove();
    });
    const cleaned = sanitizeHtml(pageUrl, $frag("#teling-desc").html() || "");
    const text = cheerio.load(cleaned).text().replace(/\s+/g, " ").trim();
    if (text.length >= 40 || cleaned.length >= 80) candidates.push(cleaned);
  };

  // 1) Explicit description heading → nearest content block
  $("h3, h4, .title-block, .title_block").each((_, el) => {
    const title = $(el).text().replace(/\s+/g, " ").trim().toLowerCase();
    if (title !== "описание") return;
    const next = $(el).next();
    push(next.hasClass("sub-content-block") || next.hasClass("sub_content_block") ? next.html() : next.html());
    push($(el).parent().find(".sub-content-block, .sub_content_block").first().html());
    push($(el).siblings(".sub-content-block, .sub_content_block").first().html());
  });

  // 2) Known D-Link / Origo containers (content blocks only, not the whole section with H4)
  for (const sel of [
    "#section1 .sub-content-block",
    "#section1 .sub_content_block",
    "section#section1 .sub-content-block",
    "section#section1 .sub_content_block",
    ".sub-content-block.open",
    ".product-attributes #section1 .sub-content-block",
    ".product_attributes #section1 .sub_content_block",
  ]) {
    push($(sel).first().html());
  }

  // 3) Fallback: #section1 without its title heading
  const section = $("#section1").first().clone();
  section.find("h3, h4, .title-block, .title_block").first().remove();
  push(section.html());

  // 3b) Official RU distributor aten.ru product card tabs
  push($("#description").first().html());
  // Features list often follows description on aten.ru; keep description tab first.

  // 3c) atenpro.ru product detail
  for (const sel of [
    ".detail_text",
    ".product-item-detail-text",
    ".bx_item_description",
    "[itemprop='description'] .detail_text",
  ]) {
    push($(sel).first().html());
  }

  // 3d) systeme.ru / svc.ru product cards
  for (const sel of [
    "[itemprop='description']",
    ".catalog__item-info-text",
    ".catalog-item__description",
    ".product-item-detail-text-detail",
    ".detail_text",
    ".bx_item_description",
  ]) {
    push($(sel).first().html());
  }

  // 4) ATEN / generic product pages
  for (const sel of [
    "[itemprop='description']",
    ".product-description",
    ".product-overview",
    ".product-brief",
    ".overview-content",
    "#overview",
    ".tab-content .description",
    "#description",
    ".pd-content",
    ".product-detail-content",
    ".Rich-Content-Block-Description",
  ]) {
    push($(sel).first().html());
  }
  // ATEN rich-content feature sections (text blocks only; skip promo banners).
  const atenBlocks: string[] = [];
  $(".row.Rich-Content-Section .wording_block, .Rich-Content-Block-Description").each((_, el) => {
    const clone = $(el).clone();
    clone.find("img, picture, video, script, style").remove();
    const htmlBlock = clone.html() || "";
    const text = cheerio.load(htmlBlock).text().replace(/\s+/g, " ").trim();
    if (text.length < 50 || text.length > 1200) return;
    if (/latest server room|cookie|privacy|related products|newsletter/i.test(text)) return;
    atenBlocks.push(htmlBlock);
  });
  if (atenBlocks.length) push(atenBlocks.slice(0, 8).join("\n"));
  const h1 = $("h1").first().text().replace(/\s+/g, " ").trim();
  if (h1 && h1.length >= 20) push(`<p>${h1}</p>`);
  const og = $("meta[property='og:description']").attr("content");
  if (og && og.trim().length >= 40) push(`<p>${og.trim()}</p>`);
  const metaDesc = $("meta[name='description']").attr("content");
  if (metaDesc && metaDesc.trim().length >= 40 && !/^\s*\|\s*/.test(metaDesc)) {
    push(`<p>${metaDesc.trim()}</p>`);
  }

  // Prefer the longest textual candidate
  candidates.sort((a, b) => {
    const ta = cheerio.load(a).text().trim().length;
    const tb = cheerio.load(b).text().trim().length;
    return tb - ta;
  });
  return candidates[0] || "";
}

function cleanCharText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isJunkCharName(name: string): boolean {
  if (!name || name.length < 2) return true;
  if (/^\d+$/.test(name)) return true;
  if (/^mcs$/i.test(name)) return true;
  if (name.length > 120) return true;
  return false;
}

function collectCharGroupsFromRoot(
  $: ReturnType<typeof cheerio.load>,
  root: { length: number; find: (sel: string) => { each: Function } },
): ProductCharGroup[] {
  if (!root.length) return [];

  const groups: ProductCharGroup[] = [];
  let current: ProductCharGroup = { name: "Характеристики", items: [] };

  root.find("tr").each((_, el) => {
    const $row = $(el);
    const cells = $row.find("td, th");
    if (!cells.length) return;

    const first = cells.first();
    const colspan = Number(first.attr("colspan") || 1);
    if (colspan >= 2 || cells.length === 1) {
      const groupName = cleanCharText(first.text()).replace(/\s+/g, " ");
      if (!groupName) return;
      if (current.items.length) groups.push(current);
      current = { name: groupName.slice(0, 80), items: [] };
      return;
    }

    if (cells.length < 2) return;
    const name = cleanCharText($(cells[0]).text()).replace(/\s+/g, " ");
    const value = cleanCharText($(cells[1]).text())
      .replace(/\n/g, " • ")
      .replace(/(?:•\s*){2,}/g, "• ")
      .replace(/\s+•/g, " •")
      .trim();
    if (isJunkCharName(name) || !value || value.length < 1) return;
    // Skip dense MCS rate matrices.
    if (name.length <= 3 && /\d/.test(name) && value.split(/\s+/).length > 8) return;
    if (current.items.length >= 40) return;
    current.items.push({ name: name.slice(0, 100), value: value.slice(0, 500) });
  });

  if (current.items.length) groups.push(current);
  return groups.filter((g) => g.items.length > 0).slice(0, 12);
}

function collectSystemePropGroups($: ReturnType<typeof cheerio.load>): ProductCharGroup[] {
  const groups: ProductCharGroup[] = [];
  const groupsRoot = $(".specification__groups, .specification");
  if (groupsRoot.length) {
    $(".specification-group").each((_, el) => {
      const groupName =
        cleanCharText($(el).find(".specification-group__top .display4, .display4").first().text())
          .replace(/\s+/g, " ")
          .trim() || "Характеристики";
      const items: ProductCharGroup["items"] = [];
      $(el)
        .find(".prop-item")
        .each((__, prop) => {
          const name = cleanCharText($(prop).find(".prop-item__title").text()).replace(/\s+/g, " ");
          const value = cleanCharText($(prop).find(".prop-item__desc").text()).replace(/\s+/g, " ");
          if (isJunkCharName(name) || !value) return;
          if (/логистическ/i.test(groupName)) return;
          items.push({ name: name.slice(0, 100), value: value.slice(0, 500) });
        });
      if (items.length) groups.push({ name: groupName.slice(0, 80), items: items.slice(0, 40) });
    });
    if (groups.length) return groups.slice(0, 12);
  }

  // Flat prop list fallback
  const flat: ProductCharGroup["items"] = [];
  $(".prop-item").each((_, el) => {
    const name = cleanCharText($(el).find(".prop-item__title").text()).replace(/\s+/g, " ");
    const value = cleanCharText($(el).find(".prop-item__desc").text()).replace(/\s+/g, " ");
    if (isJunkCharName(name) || !value) return;
    flat.push({ name: name.slice(0, 100), value: value.slice(0, 500) });
  });
  if (flat.length) return [{ name: "Характеристики", items: flat.slice(0, 40) }];
  return [];
}

function collectSvcCompareTable($: ReturnType<typeof cheerio.load>): ProductCharGroup[] {
  const items: ProductCharGroup["items"] = [];
  // svc.ru compare/spec tables: first column = name, second = value for current offer.
  $("table.offers_table tr, .catalog-compare-table table tr, table tr").each((_, el) => {
    const cells = $(el).find("td, th");
    if (cells.length < 2) return;
    const name = cleanCharText($(cells[0]).text()).replace(/\s+/g, " ");
    const value = cleanCharText($(cells[1]).text()).replace(/\s+/g, " ");
    if (isJunkCharName(name) || !value) return;
    if (/^название$/i.test(name) || /сравнить/i.test(value)) return;
    if (name.length > 80) return;
    if (items.some((i) => i.name === name)) return;
    items.push({ name: name.slice(0, 100), value: value.slice(0, 500) });
  });
  if (items.length >= 4) return [{ name: "Характеристики", items: items.slice(0, 40) }];
  return [];
}

function pickCharacteristics($: ReturnType<typeof cheerio.load>): ProductCharGroup[] {
  // systeme.ru specification props
  const systeme = collectSystemePropGroups($);
  if (systeme.length) return systeme;

  // svc.ru compare/spec tables
  const svc = collectSvcCompareTable($);
  if (svc.length) return svc;

  // aten.ru specification tab
  const atenSpec = collectCharGroupsFromRoot($, $("#spec").first());
  if (atenSpec.length) return atenSpec;

  // atenpro.ru / Bitrix / svc.ru property tables
  const atenpro = collectCharGroupsFromRoot(
    $,
    $(
      ".product-item-detail-properties, .bx_item_detail_props, .detail_chars, .product-item-detail-properties-container, .chars",
    ).first(),
  );
  if (atenpro.length) return atenpro;

  const root =
    $("#section2 .sub-content-block, #section2 .sub_content_block").first().length > 0
      ? $("#section2 .sub-content-block, #section2 .sub_content_block").first()
      : $("#section2").first();
  return collectCharGroupsFromRoot($, root);
}

function hasCyrillic(text: string): boolean {
  return /[А-Яа-яЁё]/.test(text);
}

function mergeCharGroups(
  existing: ProductCharGroup[] | undefined,
  incoming: ProductCharGroup[],
): ProductCharGroup[] {
  const result: ProductCharGroup[] = [];
  const seen = new Set<string>();

  const pushGroup = (group: ProductCharGroup) => {
    const key = group.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(group);
  };

  // Keep our synthetic filter chars (e.g. Управление/PoE) first when present.
  for (const group of existing || []) {
    if (group.name === "Характеристики" && group.items.some((i) => i.name === "Управление" || i.name === "PoE")) {
      pushGroup(group);
    }
  }
  for (const group of incoming) pushGroup(group);
  for (const group of existing || []) pushGroup(group);
  return result;
}

export function extractFromHtml(
  pageUrl: string,
  html: string,
  options?: { listingImage?: string | null },
): {
  description: string;
  imageUrls: string[];
  documents: ProductDocument[];
  charGroups: ProductCharGroup[];
} {
  const $ = cheerio.load(html);
  const description = pickDescription($, pageUrl);
  const charGroups = pickCharacteristics($);

  const collected: string[] = [];
  const pushImage = (href: string | undefined) => {
    if (!href) return;
    const unwrapped = unwrapImageUrl(href);
    const abs = absoluteUrl(pageUrl, unwrapped);
    if (!abs || !isLikelyProductImage(abs)) return;
    if (!collected.includes(abs)) collected.push(abs);
  };

  // Category listing packshot first — often the only true angled hero.
  if (options?.listingImage) pushImage(options.listingImage);
  pushImage($("meta[property='og:image']").attr("content"));
  pushImage($("meta[name='twitter:image']").attr("content"));

  // Prefer lightbox/full-size links from the product photo strip first.
  $("a[href*='prod_fotos'], a[href*='/prod/'], a[href*='assets.aten.com']").each((_, el) => {
    pushImage($(el).attr("href"));
  });
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(href)) pushImage(href);
  });
  $("img[src*='prod_fotos'], img[src*='/prod/'], img[src*='assets.aten.com']").each((_, el) => {
    pushImage($(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy"));
  });
  $("img[src]").each((_, el) => {
    pushImage($(el).attr("src") || $(el).attr("data-src"));
  });

  const imageUrls = rankProductImages(collected);

  const documents: ProductDocument[] = [];
  const pushDoc = (href: string | undefined, name: string) => {
    if (!href) return;
    const abs = absoluteUrl(pageUrl, href);
    if (!abs) return;
    if (!/\.pdf(\?|$)/i.test(abs)) return;
    if (/D-Link_new_devices\.pdf|Nuclias_Connect\.pdf|Compatible_hardware/i.test(abs)) return;
    const cleanName = name.replace(/\s+/g, " ").replace(/<!--.*?-->/g, "").trim() || "Документ";
    if (documents.some((d) => d.url === abs)) return;
    documents.push({ type: guessDocType(cleanName, abs), name: cleanName, url: abs });
  };

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text();
    if (/\.pdf(\?|$)/i.test(href)) pushDoc(href, text);
  });

  return {
    description,
    imageUrls: imageUrls.slice(0, MAX_IMAGES),
    documents: documents.slice(0, 30),
    charGroups,
  };
}

function dlinkWwwFallback(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.replace(/^www\./i, "").toLowerCase() !== "dlink.ru") return null;
    if (u.hostname.toLowerCase().startsWith("www.")) return null;
    u.hostname = "www.dlink.ru";
    return u.toString();
  } catch {
    return null;
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    return await fetchTextWithCurlFallback(url);
  } catch (error) {
    const alt = dlinkWwwFallback(url);
    if (!alt) throw error;
    return await fetchTextWithCurlFallback(alt);
  }
}

async function downloadImage(url: string, destPath: string): Promise<boolean> {
  const tryOne = async (target: string) => {
    const res = await fetch(target, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok || !res.body) return false;
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(destPath));
    return true;
  };
  try {
    if (await tryOne(url)) return true;
  } catch {
    /* try www / curl fallback */
  }
  const alt = dlinkWwwFallback(url);
  if (alt) {
    try {
      if (await tryOne(alt)) return true;
    } catch {
      /* curl below */
    }
  }
  // svc.ru images often fail undici TLS — curl works.
  if (downloadFileViaCurl(url, destPath)) return true;
  if (alt && downloadFileViaCurl(alt, destPath)) return true;
  return false;
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    if (ext && ext.length <= 10) return ext;
  } catch {
    /* ignore */
  }
  return ".jpg";
}

export async function enrichProduct(
  product: ProductRaw,
  options?: {
    /** Fetch this URL instead of metadata.url (e.g. RU description source). */
    pageUrl?: string;
    /** Update description/chars only; keep existing pictures/documents. */
    descriptionOnly?: boolean;
    /** Require Cyrillic in extracted description (for RU re-enrich). */
    requireCyrillic?: boolean;
  },
): Promise<{
  product: ProductRaw;
  ok: boolean;
  error?: string;
  imagesDownloaded: number;
  descriptionChars: number;
  charCount: number;
}> {
  const pageUrl = (options?.pageUrl || product.metadata?.url || "").trim();
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
    return {
      product,
      ok: false,
      error: "no-url",
      imagesDownloaded: 0,
      descriptionChars: 0,
      charCount: 0,
    };
  }

  try {
    const html = await fetchText(pageUrl);
    const vendor = product.vendor || product.metadata?.brand || "";
    const articul = normalizeMicroinformArticul(vendor, product.metadata?.articul || "");
    let listingImage: string | undefined;
    try {
      const index = await getManufacturerIndex({ rebuild: false });
      listingImage = lookupManufacturerEntry(index, vendor, articul)?.listingImage;
    } catch {
      /* index optional for enrich */
    }
    const extracted = extractFromHtml(pageUrl, html, { listingImage });

    const extractedDesc = extracted.description.trim();
    const extractedText = extractedDesc
      ? cheerio.load(extractedDesc).text().replace(/\s+/g, " ").trim()
      : "";
    if (options?.requireCyrillic && (!extractedText || !hasCyrillic(extractedText))) {
      return {
        product,
        ok: false,
        error: "no-cyrillic-description",
        imagesDownloaded: 0,
        descriptionChars: 0,
        charCount: 0,
      };
    }

    if (options?.descriptionOnly) {
      const nextDescription = extractedDesc || product.metadata.description || "";
      let nextChars = product.metadata.chars || [];
      if (extracted.charGroups.length) {
        nextChars = mergeCharGroups(product.metadata.chars, extracted.charGroups);
      }
      const next: ProductRaw = {
        ...product,
        metadata: {
          ...product.metadata,
          description: nextDescription,
          chars: nextChars,
        },
      };
      return {
        product: next,
        ok: Boolean(extractedDesc),
        error: extractedDesc ? undefined : "no-description",
        imagesDownloaded: 0,
        descriptionChars: nextDescription.length,
        charCount: nextChars.reduce((sum, g) => sum + g.items.length, 0),
      };
    }

    if (!existsSync(PUBLIC_IMAGES_DIR)) {
      mkdirSync(PUBLIC_IMAGES_DIR, { recursive: true });
    }

    // Always rebuild local image sequence so _1 is the manufacturer hero shot.
    clearLocalSkuImages(product.sku);

    let imagesDownloaded = 0;
    const localPictureUrls: string[] = [];
    for (const imageUrl of extracted.imageUrls) {
      const ext = extensionFromUrl(imageUrl);
      const seq = localPictureUrls.length + 1;
      const rawFilename = `${product.sku}_${seq}${ext}`;
      const dest = path.join(PUBLIC_IMAGES_DIR, rawFilename);
      const ok = await downloadImage(imageUrl, dest);
      if (!ok) continue;
      try {
        const size = statSync(dest).size;
        if (size < minImageBytes(imageUrl)) {
          unlinkSync(dest);
          continue;
        }
      } catch {
        continue;
      }

      let localUrl = `/images/${encodeURIComponent(rawFilename)}`;
      try {
        const webpPath = await processMicroinformPackshot(dest);
        localUrl = `/images/${encodeURIComponent(path.basename(webpPath))}`;
      } catch {
        // Keep opaque download if knockout fails.
      }

      imagesDownloaded += 1;
      localPictureUrls.push(localUrl);
    }

    const nextDescription =
      extractedDesc ||
      product.metadata.description ||
      "";
    let nextChars = mergeCharGroups(product.metadata.chars, extracted.charGroups);
    const activeGroup = resolveActiveNetworkGroup(product);
    if (activeGroup) {
      const priceSection =
        typeof product.metadata?.price_section === "string"
          ? product.metadata.price_section
          : "";
      nextChars = refineActiveNetworkChars(
        activeGroup,
        priceSection || product.section_name || "",
        product.name,
        articul,
        nextChars,
      );
    }

    const next: ProductRaw = {
      ...product,
      metadata: {
        ...product.metadata,
        description: nextDescription,
        pictures: localPictureUrls.length ? localPictureUrls : product.metadata.pictures || [],
        documents: extracted.documents.length ? extracted.documents : product.metadata.documents || [],
        chars: nextChars,
      },
    };

    return {
      product: next,
      ok: true,
      imagesDownloaded,
      descriptionChars: nextDescription.length,
      charCount: nextChars.reduce((sum, g) => sum + g.items.length, 0),
    };
  } catch (error) {
    return {
      product,
      ok: false,
      error: error instanceof Error ? error.message : "enrich-failed",
      imagesDownloaded: 0,
      descriptionChars: 0,
      charCount: 0,
    };
  }
}

export interface EnrichBatchResult {
  processed: number;
  succeeded: number;
  failed: number;
  withDescription: number;
  withChars: number;
  imagesDownloaded: number;
  errors: Array<{ sku: string; articul: string; error: string }>;
}

export async function enrichMicroinformProducts(options?: {
  onlyMissing?: boolean;
  limit?: number;
  delayMs?: number;
  vendors?: string[];
  productIds?: number[];
  force?: boolean;
  onProgress?: (info: {
    processed: number;
    succeeded: number;
    failed: number;
    currentArticul: string;
  }) => void;
}): Promise<EnrichBatchResult> {
  const onlyMissing = options?.force ? false : options?.onlyMissing !== false;
  const limit = options?.limit ?? 50;
  const delayMs = options?.delayMs ?? 250;
  const vendorSet = options?.vendors?.length
    ? new Set(options.vendors.map((v) => v.toLowerCase()))
    : null;
  const idSet = options?.productIds?.length
    ? new Set(options.productIds.filter((id) => Number.isFinite(id)))
    : null;

  const products = readMicroinformProducts();
  const errors: EnrichBatchResult["errors"] = [];
  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let withDescription = 0;
  let withChars = 0;
  let imagesDownloaded = 0;

  for (let i = 0; i < products.length; i++) {
    if (processed >= limit) break;
    const product = products[i];
    if (idSet && !idSet.has(product.id)) continue;
    const vendor = (product.vendor || product.metadata?.brand || "").toLowerCase();
    if (vendorSet && !vendorSet.has(vendor)) continue;

    const hasDesc = Boolean(product.metadata?.description?.trim());
    const hasPics = (product.metadata?.pictures?.length || 0) > 0;
    const hasUrl = Boolean(product.metadata?.url);
    if (!hasUrl) continue;
    const descText = hasDesc
      ? cheerio.load(product.metadata.description).text().replace(/\s+/g, " ").trim()
      : "";
    const descLooksBroken = descText.startsWith("Описание ");
    const heroNeedsRefresh = firstPictureNeedsRefresh(product.metadata?.pictures);
    const hasRichChars = (product.metadata?.chars || []).some(
      (g) => g.name !== "Характеристики" || g.items.length > 5,
    );
    if (
      onlyMissing &&
      hasDesc &&
      hasPics &&
      hasRichChars &&
      !descLooksBroken &&
      !heroNeedsRefresh
    ) {
      continue;
    }

    processed += 1;
    const result = await enrichProduct(product);
    products[i] = result.product;
    imagesDownloaded += result.imagesDownloaded;
    if (result.descriptionChars > 0) withDescription += 1;
    if (result.charCount > 0) withChars += 1;
    if (result.ok) succeeded += 1;
    else {
      failed += 1;
      errors.push({
        sku: product.sku,
        articul: product.metadata?.articul || "",
        error: result.error || "failed",
      });
    }

    options?.onProgress?.({
      processed,
      succeeded,
      failed,
      currentArticul: product.metadata?.articul || product.sku,
    });

    // Checkpoint every 10 items so a long run is not lost.
    if (processed % 10 === 0) {
      writeMicroinformProducts(products);
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  writeMicroinformProducts(products);
  return {
    processed,
    succeeded,
    failed,
    withDescription,
    withChars,
    imagesDownloaded,
    errors: errors.slice(0, 50),
  };
}
