// ---- Raw JSON types ----

export interface SectionRaw {
  id: number;
  name: string;
  parent: number | null;
  external_id: string;
  metadata: {
    id: number;
    name: string;
    sort: number;
    code: string;
    url: string;
    level: number;
    parent_id: number | null;
    picture: string;
    selected_filters?: string[];
  };
}

export interface ProductCharItem {
  name: string;
  value: string;
}

export interface ProductCharGroup {
  name: string;
  items: ProductCharItem[];
}

export interface ProductDocument {
  type: string;
  name: string;
  url: string;
}

export interface ProductRaw {
  id: number;
  name: string;
  original_name: string;
  custom_name: string | null;
  sku: string;
  visible?: boolean;
  section_id: number;
  section_name: string;
  price: number;
  calculated_price: number;
  price_override: number | null;
  price_without_vat: number;
  vat_amount: number;
  currency: string;       // "Br"
  currency_code: string;  // "BYN"
  vendor: string;
  metadata: {
    articul: string;
    type: string;
    url: string;
    sections: number[];
    brand: string;
    unit: string;
    minQty: number;
    multiplicity: number;
    timeDelivery: string;
    weight: number;
    volume: number;
    updated: string;
    pictures: string[];
    video: string[];
    documents: ProductDocument[];
    zamena: string[];
    analog: string[];
    soputst: string[];
    chars: ProductCharGroup[];
    description: string;
  };
}

// ---- Public (UI) types ----

export interface Category {
  id: number;
  name: string;
  slug: string;
  parentId: number | null;
  level: number;
  imageUrl: string | null;
  sort: number;
  children: Category[];
}

/** Lightweight card representation of a product (list / grid views) */
export interface ProductSummary {
  id: number;
  name: string;
  sku: string;
  visible: boolean;
  sectionId: number;
  sectionName: string;
  sectionSlug: string;
  price: number;
  currency: string;
  currencyCode: string;
  brand: string;
  unit: string;
  type: string;
  thumbnail: string | null; // first picture URL (external)
}

/** Full product representation (detail page) */
export interface Product extends ProductSummary {
  priceWithoutVat: number;
  vatAmount: number;
  timeDelivery: string;
  weight: number;
  volume: number;
  localImages: string[];
  externalImages: string[];
  video: string[];
  documents: ProductDocument[];
  relatedSkus: string[];
  analogSkus: string[];
  replacementSkus: string[];
  chars: ProductCharGroup[];
  description: string;
  externalUrl: string;
  minQty: number;
  updatedAt: string;
}

export interface AdminProductListItem {
  id: number;
  sku: string;
  name: string;
  originalName: string;
  customName: string | null;
  sectionId: number;
  sectionName: string;
  brand: string;
  vendor: string;
  price: number;
  priceWithoutVat: number;
  currency: string;
  visible: boolean;
  picture?: string | null;
  description?: string;
  documents?: ProductDocument[];
}

export type ProductImportConflictAction = "skip" | "use-sku" | "use-id";
export type ProductImportMissingAction = "keep" | "hide" | "delete";

export interface ProductImportPreviewProduct {
  importKey: string;
  id: number;
  sku: string;
  name: string;
  sectionName: string;
  brand: string;
  price: number;
  currency: string;
}

export interface ProductImportConflictItem extends ProductImportPreviewProduct {
  conflictType: "sku" | "id" | "cross" | "duplicate";
  currentBySku: AdminProductListItem | null;
  currentById: AdminProductListItem | null;
}

export interface ProductImportMissingItem {
  currentKey: string;
  product: AdminProductListItem;
}

export interface ProductImportPreview {
  token: string;
  importedAt: string;
  currentCount: number;
  incomingCount: number;
  exactMatchCount: number;
  newProducts: ProductImportPreviewProduct[];
  conflicts: ProductImportConflictItem[];
  missingProducts: ProductImportMissingItem[];
}

export interface ProductImportApplyRequest {
  token: string;
  addNewProductKeys: string[];
  conflictActions: Record<string, ProductImportConflictAction>;
  missingActions: Record<string, ProductImportMissingAction>;
}

// ---- Import History ----

export interface ImportHistoryEntry {
  id: string; // UUID
  timestamp: string; // ISO 8601 date-time
  filename: string;
  addedCount: number;
  updatedCount: number;
  hiddenCount: number;
  deletedCount: number;
}

// ---- Filter / Facet types ----

export interface FacetItem {
  value: string;
  count: number;
}

export interface CharFacet {
  /** Parameter name, e.g. "Сечение жилы" */
  name: string;
  values: FacetItem[];
}

export interface SectionFacets {
  brands: FacetItem[];
  priceMin: number;
  priceMax: number;
  chars: CharFacet[];
}

export interface ActiveFilters {
  brands: string[];
  priceMin: number | null;
  priceMax: number | null;
  charFilters: Record<string, string[]>;
}

export interface SectionFilterOption {
  key: string;
  label: string;
  count?: number;
}
