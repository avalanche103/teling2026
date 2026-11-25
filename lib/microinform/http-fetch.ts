import { execFileSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import iconv from "iconv-lite";
import { platform, tmpdir } from "os";
import path from "path";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36";

/** True when text looks like CP1251 bytes misread as Latin-1/UTF-8. */
function looksLikeCp1251Mojibake(text: string): boolean {
  if (!text) return false;
  if (/[А-Яа-яЁё]/.test(text)) return false;
  return /[À-ÿ]{3,}/.test(text) && /[ñîáóäâàåèÿ÷ñòü]/.test(text);
}

function decodeCp1251Mojibake(text: string): string {
  const bytes = Buffer.from(Array.from(text, (ch) => ch.charCodeAt(0) & 0xff));
  return iconv.decode(bytes, "win1251");
}

/** Decode HTML using charset hints / mojibake repair (moxa.com.ua is win1251). */
export function decodeHtmlBuffer(buffer: Buffer, url = ""): string {
  const lowerUrl = url.toLowerCase();
  const head = buffer.slice(0, 4096).toString("latin1").toLowerCase();
  const metaCharset =
    head.match(/charset\s*=\s*["']?\s*(windows-1251|cp1251|utf-8|utf8)/i)?.[1] || "";
  const prefer1251 =
    /moxa\.com\.ua/i.test(lowerUrl) ||
    /windows-1251|cp1251/i.test(metaCharset);

  if (prefer1251) {
    const decoded = iconv.decode(buffer, "win1251");
    if (/[А-Яа-яЁё]/.test(decoded)) return decoded;
  }

  const asUtf8 = buffer.toString("utf8");
  if (/[А-Яа-яЁё]/.test(asUtf8)) return asUtf8;

  if (looksLikeCp1251Mojibake(asUtf8)) {
    try {
      const fixed = decodeCp1251Mojibake(asUtf8);
      if (/[А-Яа-яЁё]/.test(fixed)) return fixed;
    } catch {
      /* keep */
    }
  }

  if (/windows-1251|cp1251/i.test(metaCharset) || /moxa\.com\.ua/i.test(lowerUrl)) {
    return iconv.decode(buffer, "win1251");
  }
  return asUtf8;
}

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
    const buffer = readFileSync(outFile);
    const out = decodeHtmlBuffer(buffer, url);
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
    const buffer = Buffer.from(await res.arrayBuffer());
    const text = decodeHtmlBuffer(buffer, url);
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
