import fs from "fs";
import path from "path";

const REQUESTS_FILE = path.join(process.cwd(), "data", "requests.json");
/** First public request number; subsequent requests increment from the max stored. */
export const REQUEST_NUMBER_START = 437;

export type RequestStatus = "draft" | "submitted";

export interface RequestItem {
  sku: string;
  name: string;
  qty: number;
  price: number;
  currency: string;
}

export interface ProductRequest {
  id: string;
  /** Human-readable sequential number (starts at 437). */
  number: number;
  status: RequestStatus;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  organization: string;
  phone: string;
  email: string;
  items: RequestItem[];
  /** ISO timestamp when an admin opened the request; null/undefined = new */
  seenAt?: string | null;
  /** ISO timestamp when an admin marked the request as handled */
  handledAt?: string | null;
}

export interface SubmitProductRequestInput {
  organization: string;
  phone: string;
  email: string;
}

function readRequests(): ProductRequest[] {
  try {
    const raw = fs.readFileSync(REQUESTS_FILE, "utf-8");
    const data = JSON.parse(raw) as Partial<ProductRequest>[];
    if (!Array.isArray(data)) return [];
    return data.map((r, index) => {
      const createdAt = String(r.createdAt ?? new Date().toISOString());
      const status: RequestStatus =
        r.status === "draft" || r.status === "submitted"
          ? r.status
          : "submitted";
      return {
        id: String(r.id ?? ""),
        number:
          typeof r.number === "number" && Number.isFinite(r.number)
            ? r.number
            : REQUEST_NUMBER_START + index,
        status,
        createdAt,
        updatedAt: String(r.updatedAt ?? createdAt),
        submittedAt:
          r.submittedAt ?? (status === "submitted" ? createdAt : null),
        organization: String(r.organization ?? ""),
        phone: String(r.phone ?? ""),
        email: String(r.email ?? ""),
        items: Array.isArray(r.items) ? (r.items as RequestItem[]) : [],
        seenAt: r.seenAt ?? null,
        handledAt: r.handledAt ?? null,
      };
    });
  } catch {
    return [];
  }
}

function writeRequests(requests: ProductRequest[]): void {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

function nextRequestNumber(requests: ProductRequest[]): number {
  let max = REQUEST_NUMBER_START - 1;
  for (const r of requests) {
    if (typeof r.number === "number" && r.number > max) max = r.number;
  }
  return max + 1;
}

export function getRequests(): ProductRequest[] {
  return readRequests();
}

export function getRequestById(id: string): ProductRequest | undefined {
  return readRequests().find((r) => r.id === id);
}

/**
 * Create a new draft or update an existing draft's items.
 * Returns null when a stale/missing id would otherwise resurrect an empty draft
 * (client should treat this as `gone` and clear local state).
 */
export function upsertDraftRequest(
  id: string | null | undefined,
  items: RequestItem[]
): ProductRequest | null {
  const requests = readRequests();
  const now = new Date().toISOString();

  if (id) {
    const idx = requests.findIndex((r) => r.id === id);
    if (idx !== -1) {
      const existing = requests[idx];
      if (existing.status === "submitted") {
        // Already submitted — start a fresh draft with a new number.
      } else {
        requests[idx] = {
          ...existing,
          items,
          updatedAt: now,
          // New activity makes it unread again for admin.
          seenAt: null,
        };
        writeRequests(requests);
        return requests[idx];
      }
    } else if (items.length === 0) {
      // Admin deleted this draft; do not recreate an empty one.
      return null;
    }
  }

  // Never create a brand-new draft with no items.
  if (items.length === 0) {
    return null;
  }

  const request: ProductRequest = {
    id: crypto.randomUUID(),
    number: nextRequestNumber(requests),
    status: "draft",
    createdAt: now,
    updatedAt: now,
    submittedAt: null,
    organization: "",
    phone: "",
    email: "",
    items,
    seenAt: null,
    handledAt: null,
  };
  requests.push(request);
  writeRequests(requests);
  return request;
}

export function submitProductRequest(
  id: string,
  input: SubmitProductRequestInput,
  items?: RequestItem[]
): ProductRequest | null {
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const existing = requests[idx];
  if (existing.status === "submitted") {
    return existing;
  }

  requests[idx] = {
    ...existing,
    status: "submitted",
    organization: input.organization,
    phone: input.phone,
    email: input.email,
    items: items ?? existing.items,
    updatedAt: now,
    submittedAt: now,
    seenAt: null,
    handledAt: null,
  };
  writeRequests(requests);
  return requests[idx];
}

export function markRequestSeen(id: string): ProductRequest | null {
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  if (!requests[idx].seenAt) {
    requests[idx].seenAt = new Date().toISOString();
    writeRequests(requests);
  }
  return requests[idx];
}

export function setRequestHandled(
  id: string,
  handled: boolean
): ProductRequest | null {
  const requests = readRequests();
  const idx = requests.findIndex((r) => r.id === id);
  if (idx === -1) return null;

  const now = new Date().toISOString();
  const current = requests[idx];
  requests[idx] = {
    ...current,
    handledAt: handled ? now : null,
    // Marking handled implies the request was seen.
    seenAt: handled ? current.seenAt || now : current.seenAt,
    updatedAt: now,
  };
  writeRequests(requests);
  return requests[idx];
}

export function deleteRequestById(id: string): boolean {
  const requests = readRequests();
  const next = requests.filter((r) => r.id !== id);
  if (next.length === requests.length) return false;
  writeRequests(next);
  return true;
}

/** Removes all draft (unsubmitted) requests. Returns how many were deleted. */
export function deleteDraftRequests(): number {
  const requests = readRequests();
  const next = requests.filter((r) => r.status !== "draft");
  const removed = requests.length - next.length;
  if (removed > 0) writeRequests(next);
  return removed;
}

export function countUnseenRequests(): number {
  return readRequests().filter((r) => !r.seenAt).length;
}
