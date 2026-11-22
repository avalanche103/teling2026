import { cleanSnippetText, extractPricesFromText } from "./extract-prices";
import type { SerpEngine, SerpHit } from "./types";

const YANDEX_URL = "https://xmlriver.com/search_yandex/xml";
const GOOGLE_URL = "https://xmlriver.com/search/xml";

/** Yandex region: Minsk */
const DEFAULT_YANDEX_LR = "157";
/** Google language; set XMLRIVER_GOOGLE_COUNTRY / DOMAIN from XMLRiver cabinet for BY */
const DEFAULT_GOOGLE_LR = "ru";

export function isXmlRiverConfigured(): boolean {
  return Boolean(process.env.XMLRIVER_USER?.trim() && process.env.XMLRIVER_KEY?.trim());
}

function credentials(): { user: string; key: string } {
  const user = process.env.XMLRIVER_USER?.trim() || "";
  const key = process.env.XMLRIVER_KEY?.trim() || "";
  if (!user || !key) {
    throw new Error("XMLRiver не настроен: задайте XMLRIVER_USER и XMLRIVER_KEY");
  }
  return { user, key };
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/gi, " ");
}

function tagContents(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlEntities(m[1]));
  }
  return out;
}

function firstTag(xml: string, tag: string): string {
  return tagContents(xml, tag)[0] || "";
}

function parseError(xml: string): string | null {
  const code = firstTag(xml, "code") || firstTag(xml, "errorcode");
  const message =
    firstTag(xml, "message") ||
    firstTag(xml, "error") ||
    firstTag(xml, "text") ||
    "";
  if (!code && !/error/i.test(xml.slice(0, 400))) return null;
  // Empty SERP is often code 15 — treat as no results, not a hard failure
  if (code === "15" || code === "20") return null;
  if (code || message) {
    return `XMLRiver error${code ? ` ${code}` : ""}${message ? `: ${cleanSnippetText(message)}` : ""}`;
  }
  return null;
}

/** Parse Yandex/Google XMLRiver response into organic docs. */
export function parseSerpXml(xml: string, engine: SerpEngine): SerpHit[] {
  const err = parseError(xml);
  if (err) throw new Error(err);

  const docs = tagContents(xml, "doc");
  const hits: SerpHit[] = [];

  for (const doc of docs) {
    const title = cleanSnippetText(firstTag(doc, "title"));
    const url = cleanSnippetText(firstTag(doc, "url")).trim();
    const passages = tagContents(doc, "passage").map(cleanSnippetText).filter(Boolean);
    const headline = cleanSnippetText(firstTag(doc, "headline"));
    const snippet = [headline, ...passages].filter(Boolean).join(" · ");
    const blob = `${title} ${snippet}`;
    const prices = extractPricesFromText(blob);
    if (!title && !url) continue;
    hits.push({
      engine,
      title: title || url,
      url,
      snippet,
      prices,
    });
  }

  // Fallback: some Google responses nest differently — try <group> blocks
  if (hits.length === 0) {
    const groups = tagContents(xml, "group");
    for (const group of groups) {
      const title = cleanSnippetText(firstTag(group, "title"));
      const url = cleanSnippetText(firstTag(group, "url")).trim();
      const snippet = cleanSnippetText(
        firstTag(group, "passage") || firstTag(group, "headline") || firstTag(group, "snippet"),
      );
      const prices = extractPricesFromText(`${title} ${snippet}`);
      if (!title && !url) continue;
      hits.push({ engine, title: title || url, url, snippet, prices });
    }
  }

  return hits;
}

async function fetchXml(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/xml,text/xml,*/*" },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`XMLRiver HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return text;
}

export async function searchYandex(query: string): Promise<SerpHit[]> {
  const { user, key } = credentials();
  const lr = process.env.XMLRIVER_YANDEX_LR?.trim() || DEFAULT_YANDEX_LR;
  const domain = process.env.XMLRIVER_YANDEX_DOMAIN?.trim() || "by";
  const params = new URLSearchParams({
    user,
    key,
    query: query.replace(/&/g, " "),
    groupby: "10",
    lr,
    domain,
    lang: "ru",
    device: "desktop",
  });
  const xml = await fetchXml(`${YANDEX_URL}?${params.toString()}`);
  return parseSerpXml(xml, "yandex");
}

export async function searchGoogle(query: string): Promise<SerpHit[]> {
  const { user, key } = credentials();
  const lr = process.env.XMLRIVER_GOOGLE_LR?.trim() || DEFAULT_GOOGLE_LR;
  const params = new URLSearchParams({
    user,
    key,
    query: query.replace(/&/g, " "),
    groupby: "10",
    lr,
    device: "desktop",
  });
  const country = process.env.XMLRIVER_GOOGLE_COUNTRY?.trim();
  if (country) params.set("country", country);
  const domain = process.env.XMLRIVER_GOOGLE_DOMAIN?.trim();
  if (domain) params.set("domain", domain);
  const loc = process.env.XMLRIVER_GOOGLE_LOC?.trim();
  if (loc) params.set("loc", loc);
  const xml = await fetchXml(`${GOOGLE_URL}?${params.toString()}`);
  return parseSerpXml(xml, "google");
}

export async function searchBothEngines(query: string): Promise<{
  hits: SerpHit[];
  errors: string[];
}> {
  const errors: string[] = [];
  const hits: SerpHit[] = [];

  const [yandex, google] = await Promise.allSettled([
    searchYandex(query),
    searchGoogle(query),
  ]);

  if (yandex.status === "fulfilled") hits.push(...yandex.value);
  else errors.push(`Yandex: ${yandex.reason instanceof Error ? yandex.reason.message : String(yandex.reason)}`);

  if (google.status === "fulfilled") hits.push(...google.value);
  else errors.push(`Google: ${google.reason instanceof Error ? google.reason.message : String(google.reason)}`);

  return { hits, errors };
}
