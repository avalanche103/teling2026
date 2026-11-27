import type { ProductRaw, SectionRaw } from "@/lib/types";
import { readConceptProducts, readSections, writeConceptProducts } from "./store";

export interface PendingProductSummary {
  id: number;
  sku: string;
  vendor: string;
  articul: string;
  name: string;
  section_id: number;
  section_name: string;
  price: number;
  timeDelivery: string;
  hasUrl: boolean;
  hasDescription: boolean;
  hasPictures: boolean;
  pictureCount: number;
}

export function listPendingConceptProducts(): PendingProductSummary[] {
  return readConceptProducts()
    .filter((p) => p.metadata?.import_status === "new")
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      vendor: p.vendor || p.metadata?.brand || "",
      articul: p.metadata?.articul || "",
      name: p.custom_name || p.name,
      section_id: p.section_id,
      section_name: p.section_name,
      price: p.price,
      timeDelivery: p.metadata?.timeDelivery || "",
      hasUrl: Boolean(p.metadata?.url?.trim()),
      hasDescription: Boolean(p.metadata?.description?.trim()),
      hasPictures: (p.metadata?.pictures?.length || 0) > 0,
      pictureCount: p.metadata?.pictures?.length || 0,
    }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor) || a.name.localeCompare(b.name));
}

export interface PublishResult {
  published: number;
  missingIds: number[];
}

export function publishConceptProducts(params: {
  ids: number[];
  sectionId?: number;
}): PublishResult {
  const idSet = new Set(params.ids.filter((id) => Number.isFinite(id)));
  if (idSet.size === 0) return { published: 0, missingIds: [] };

  let section: SectionRaw | null = null;
  if (typeof params.sectionId === "number" && Number.isFinite(params.sectionId)) {
    section = readSections().find((s) => s.id === params.sectionId) || null;
    if (!section) throw new Error(`Раздел ${params.sectionId} не найден`);
  }

  const products = readConceptProducts();
  const found = new Set<number>();
  let published = 0;

  const next: ProductRaw[] = products.map((product) => {
    if (!idSet.has(product.id)) return product;
    found.add(product.id);
    if (product.metadata?.import_status !== "new") return product;

    const { import_status: _drop, absent_from_price: _absent, ...restMeta } = product.metadata;
    published += 1;
    return {
      ...product,
      visible: true,
      ...(section
        ? {
            section_id: section.id,
            section_name: section.name,
          }
        : {}),
      metadata: {
        ...restMeta,
        ...(section ? { sections: [section.id] } : {}),
      },
    };
  });

  writeConceptProducts(next);
  return {
    published,
    missingIds: [...idSet].filter((id) => !found.has(id)),
  };
}
