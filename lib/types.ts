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
