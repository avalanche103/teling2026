import { spawn } from "node:child_process";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";

export const PRODUCT_IMPORT_UPLOAD_PATH = "data/products.import.upload.json";
export const PRODUCT_IMPORT_NDJSON_PATH = "data/products.import.ndjson";
export const PRODUCT_IMPORT_META_PATH = "data/products.import.meta.json";
export const PRODUCT_IMPORT_PREVIEW_PATH = "data/products.import.preview.json";
export const PRODUCT_IMPORT_ACTIONS_PATH = "data/products.import.actions.json";
export const PRODUCT_IMPORT_RESULT_PATH = "data/products.import.result.json";

const WORKER_RELATIVE = path.join("scripts", "product-import-worker.mjs");
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface ProductImportWorkerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  parsed?: Record<string, unknown>;
  error?: string;
}

function parseJsonLine(text: string): Record<string, unknown> | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(lines[i]!) as Record<string, unknown>;
    } catch {
      // keep scanning
    }
  }
  return null;
}

export function runProductImportWorker(
  command: "analyze" | "apply",
  options?: { cwd?: string; timeoutMs?: number },
): Promise<ProductImportWorkerResult> {
  const cwd = options?.cwd ?? process.cwd();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const workerPath = path.join(cwd, WORKER_RELATIVE);

  if (!existsSync(workerPath)) {
    return Promise.resolve({
      ok: false,
      stdout: "",
      stderr: "",
      code: null,
      signal: null,
      error: `Worker не найден: ${WORKER_RELATIVE}`,
    });
  }

  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ["--max-old-space-size=512", workerPath, command, "--cwd", cwd],
      {
        cwd,
        env: {
          ...process.env,
          // Keep worker heap isolated from Next's NODE_OPTIONS.
          NODE_OPTIONS: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      resolve({
        ok: false,
        stdout,
        stderr,
        code: null,
        signal: "SIGKILL",
        error: "Импорт превысил лимит времени (5 мин)",
      });
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ok: false,
        stdout,
        stderr,
        code: null,
        signal: null,
        error: err.message,
      });
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);

      const fromStderr = parseJsonLine(stderr);
      const fromStdout = parseJsonLine(stdout);
      const parsed = code === 0 ? fromStdout : fromStderr ?? fromStdout;

      if (code === 0 && parsed?.ok) {
        resolve({ ok: true, stdout, stderr, code, signal, parsed });
        return;
      }

      const error =
        (typeof parsed?.error === "string" && parsed.error) ||
        stderr.trim() ||
        stdout.trim() ||
        (signal ? `Worker остановлен сигналом ${signal}` : `Worker завершился с кодом ${code ?? "?"}`);

      resolve({
        ok: false,
        stdout,
        stderr,
        code,
        signal,
        parsed: parsed ?? undefined,
        error,
      });
    });
  });
}

export function readImportPreviewFile(cwd = process.cwd()): unknown {
  const previewPath = path.join(cwd, PRODUCT_IMPORT_PREVIEW_PATH);
  return JSON.parse(readFileSync(previewPath, "utf-8"));
}

export function readImportResultFile(cwd = process.cwd()): {
  filename: string;
  addedCount: number;
  updatedCount: number;
  hiddenCount: number;
  deletedCount: number;
  totalCount: number;
} {
  const resultPath = path.join(cwd, PRODUCT_IMPORT_RESULT_PATH);
  return JSON.parse(readFileSync(resultPath, "utf-8")) as {
    filename: string;
    addedCount: number;
    updatedCount: number;
    hiddenCount: number;
    deletedCount: number;
    totalCount: number;
  };
}
