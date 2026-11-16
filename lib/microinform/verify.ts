import type { ProductRaw } from "@/lib/types";
import { invalidateProductCaches } from "@/lib/data";
import { normalizeMicroinformArticul, stripDlinkRevisionsFromText } from "./articul";
import { enrichProduct } from "./enrich";
import {
  extractManufacturerPageInfo,
  getManufacturerIndex,
  resolveManufacturerPage,
  type ManufacturerIndex,
} from "./manufacturer";
import { readMicroinformProducts, writeMicroinformProducts } from "./store";

export interface VerifyBatchResult {
  processed: number;
  urlUpdated: number;
  nameUpdated: number;
  enriched: number;
  failed: number;
  unresolved: number;
  indexSize: number;
  errors: Array<{ sku: string; articul: string; error: string }>;
  samples: Array<{
    articul: string;
    sku: string;
    urlBefore: string | null;
    urlAfter: string | null;
    nameBefore: string;
    nameAfter: string;
  }>;
}

function isTargetVendor(vendor: string): boolean {
  return /^d-?link$/i.test(vendor) || /^origo$/i.test(vendor);
}

function namesDiffer(a: string, b: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(a) !== norm(b);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "ru-RU,ru;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

export async function verifyManufacturerProducts(options?: {
  vendors?: string[];
  limit?: number;
  delayMs?: number;
  rebuildIndex?: boolean;
  updateMedia?: boolean;
  onlyMismatched?: boolean;
  onProgress?: (info: {
    processed: number;
    urlUpdated: number;
    nameUpdated: number;
    currentArticul: string;
  }) => void;
}): Promise<VerifyBatchResult> {
  const limit = options?.limit ?? 80;
  const delayMs = options?.delayMs ?? 250;
  const updateMedia = options?.updateMedia !== false;
  const onlyMismatched = options?.onlyMismatched === true;
  const vendorFilter = options?.vendors?.length
    ? new Set(options.vendors.map((v) => v.toLowerCase()))
    : null;

  const index: ManufacturerIndex = await getManufacturerIndex({
    rebuild: options?.rebuildIndex !== false,
  });

  const products = readMicroinformProducts();
  const errors: VerifyBatchResult["errors"] = [];
  const samples: VerifyBatchResult["samples"] = [];
  let processed = 0;
  let urlUpdated = 0;
  let nameUpdated = 0;
  let enriched = 0;
  let failed = 0;
  let unresolved = 0;

  for (let i = 0; i < products.length; i++) {
    if (processed >= limit) break;
    const product = products[i]!;
    const vendor = product.vendor || product.metadata?.brand || "";
    if (!isTargetVendor(vendor)) continue;
    if (vendorFilter && !vendorFilter.has(vendor.toLowerCase())) continue;

    const articul = normalizeMicroinformArticul(vendor, product.metadata?.articul || "");
    const urlBefore = product.metadata?.url || null;
    const nameBefore = product.name || "";

    processed += 1;

    try {
      const resolved = await resolveManufacturerPage(vendor, articul, urlBefore, index);
      if (!resolved.url) {
        unresolved += 1;
        errors.push({ sku: product.sku, articul, error: "no-manufacturer-url" });
        continue;
      }

      let next: ProductRaw = {
        ...product,
        metadata: {
          ...product.metadata,
          articul,
          url: resolved.url,
        },
      };

      const urlChanged = normalizeUrlKey(urlBefore) !== normalizeUrlKey(resolved.url);
      if (urlChanged) urlUpdated += 1;

      // Always refresh manufacturer title; optionally refresh media/description.
      const html = await fetchText(resolved.url);
      const info = extractManufacturerPageInfo(resolved.url, html, vendor, articul);
      const manufacturerName = info?.displayName
        ? stripDlinkRevisionsFromText(info.displayName)
        : stripDlinkRevisionsFromText(nameBefore);

      const shouldEnrich =
        updateMedia &&
        (urlChanged ||
          !product.metadata?.description?.trim() ||
          !(product.metadata?.pictures?.length > 0) ||
          /_front|front\d*\./i.test(product.metadata?.pictures?.[0] || "") ||
          /dlink\.by/i.test(urlBefore || ""));

      if (onlyMismatched && !urlChanged && !namesDiffer(nameBefore, manufacturerName) && !shouldEnrich) {
        continue;
      }

      if (shouldEnrich) {
        const enrichResult = await enrichProduct(next);
        next = enrichResult.product;
        if (enrichResult.ok) enriched += 1;
        else {
          failed += 1;
          errors.push({
            sku: product.sku,
            articul,
            error: enrichResult.error || "enrich-failed",
          });
        }
      }

      if (manufacturerName) {
        if (namesDiffer(nameBefore, manufacturerName)) nameUpdated += 1;
        next = {
          ...next,
          name: manufacturerName,
          original_name: manufacturerName,
        };
      }

      // Keep resolved URL even if enrich failed.
      next = {
        ...next,
        metadata: {
          ...next.metadata,
          articul,
          url: resolved.url,
        },
      };

      products[i] = next;

      if (samples.length < 25 && (urlChanged || namesDiffer(nameBefore, next.name))) {
        samples.push({
          articul,
          sku: next.sku,
          urlBefore,
          urlAfter: next.metadata.url || null,
          nameBefore,
          nameAfter: next.name,
        });
      }

      options?.onProgress?.({
        processed,
        urlUpdated,
        nameUpdated,
        currentArticul: articul,
      });

      if (processed % 10 === 0) writeMicroinformProducts(products);
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    } catch (error) {
      failed += 1;
      errors.push({
        sku: product.sku,
        articul,
        error: error instanceof Error ? error.message : "verify-failed",
      });
    }
  }

  writeMicroinformProducts(products);
  invalidateProductCaches();

  return {
    processed,
    urlUpdated,
    nameUpdated,
    enriched,
    failed,
    unresolved,
    indexSize: index.entries.length,
    errors: errors.slice(0, 50),
    samples,
  };
}

function normalizeUrlKey(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}
