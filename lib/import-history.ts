import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { ImportHistoryEntry } from "./types";

const IMPORT_HISTORY_FILE = path.join(process.cwd(), "data", "import-history.json");

/**
 * Load the import history from disk
 */
export async function loadImportHistory(): Promise<ImportHistoryEntry[]> {
  try {
    const content = await fs.readFile(IMPORT_HISTORY_FILE, "utf-8");
    return JSON.parse(content) as ImportHistoryEntry[];
  } catch (error) {
    // File doesn't exist yet or is corrupted
    return [];
  }
}

/**
 * Save an import history entry
 */
export async function saveImportHistoryEntry(params: {
  filename: string;
  addedCount: number;
  updatedCount: number;
  hiddenCount: number;
  deletedCount: number;
}): Promise<ImportHistoryEntry> {
  const history = await loadImportHistory();

  const entry: ImportHistoryEntry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    filename: params.filename,
    addedCount: params.addedCount,
    updatedCount: params.updatedCount,
    hiddenCount: params.hiddenCount,
    deletedCount: params.deletedCount,
  };

  // Add to beginning (most recent first)
  const updated = [entry, ...history];

  // Keep only last 100 entries
  const trimmed = updated.slice(0, 100);

  await fs.writeFile(IMPORT_HISTORY_FILE, JSON.stringify(trimmed, null, 2));

  return entry;
}

/**
 * Get all import history entries, sorted by most recent first
 */
export async function getImportHistory(): Promise<ImportHistoryEntry[]> {
  return loadImportHistory();
}
