import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { platform, tmpdir } from "os";
import path from "path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36";

function curlBin(): string {
  return platform() === "win32" ? "curl.exe" : "curl";
}

/** Fetch HTML via curl — more reliable for sites that break undici (svc.ru). */
export function fetchTextViaCurl(url: string, timeoutSec = 45): string {
  const dir = mkdtempSync(path.join(tmpdir(), "teling-curl-"));
  const outFile = path.join(dir, "body.html");
  try {
    execFileSync(
      curlBin(),
      [
        "-sL",
        "--fail",
        "--max-time",
        String(timeoutSec),
        "-A",
        UA,
        "-H",
        "Accept-Language: ru-RU,ru;q=0.9",
        "-H",
        "Accept: text/html,application/xhtml+xml",
        "-o",
        outFile,
        url,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const out = readFileSync(outFile, "utf8");
    if (!out || out.length < 50) throw new Error(`curl empty response for ${url}`);
    return out;
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export async function fetchTextWithCurlFallback(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (text && text.length >= 50) return text;
    throw new Error("empty body");
  } catch (error) {
    // svc.ru / some hosts fail undici TLS; curl works.
    try {
      return fetchTextViaCurl(url);
    } catch {
      throw error;
    }
  }
}

/** Download binary to destPath via curl (reliable for svc.ru images). */
export function downloadFileViaCurl(url: string, destPath: string, timeoutSec = 45): boolean {
  try {
    execFileSync(
      curlBin(),
      [
        "-sL",
        "--fail",
        "--max-time",
        String(timeoutSec),
        "-A",
        UA,
        "-o",
        destPath,
        url,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const raw = readFileSync(destPath);
    return raw.length > 1000;
  } catch {
    try {
      // Clean partial file
      rmSync(destPath, { force: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}
