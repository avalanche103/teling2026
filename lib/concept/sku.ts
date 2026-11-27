import type { ConceptState } from "./store";

const SKU_PREFIX = 920000;
const SKU_SECOND_MAX = 99999;
export const CONCEPT_ID_MIN = 3_000_000;

export function formatConceptSku(seq: number): string {
  const firstOffset = Math.floor((seq - 1) / (SKU_SECOND_MAX + 1));
  const second = ((seq - 1) % (SKU_SECOND_MAX + 1)) + 1;
  const first = SKU_PREFIX + firstOffset;
  return `${String(first).padStart(6, "0")}-${String(second).padStart(5, "0")}`;
}

export function allocateSku(
  state: ConceptState,
  articul: string,
  occupiedSkus: Set<string>,
): string {
  const existing = state.articulToSku[articul];
  if (existing) return existing;

  let seq = state.nextSkuSeq;
  let sku = formatConceptSku(seq);
  while (occupiedSkus.has(sku) || Object.values(state.articulToSku).includes(sku)) {
    seq += 1;
    sku = formatConceptSku(seq);
  }

  state.nextSkuSeq = seq + 1;
  state.articulToSku[articul] = sku;
  occupiedSkus.add(sku);
  return sku;
}

export function allocateId(state: ConceptState, articul: string): number {
  const existing = state.articulToId[articul];
  if (typeof existing === "number" && existing >= CONCEPT_ID_MIN) {
    return existing;
  }
  const id = state.nextId;
  state.nextId = id + 1;
  state.articulToId[articul] = id;
  return id;
}
