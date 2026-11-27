import { readFileSync, unlinkSync, writeFileSync, existsSync } from "fs";
import path from "path";
import sharp from "sharp";

/** Near-white threshold for manufacturer packshots (D-Link / Origo / KIWI). */
const WHITE_THRESH = 248;
/** Near-black studio backdrops (some EXFO / KIWI shop shots). */
const BLACK_THRESH = 18;

/**
 * Flood-fill near-white (and near-black) background from image edges → transparent alpha.
 * Matches SSD cutouts so catalog `bg-slate-100` shows through as gray.
 */
export async function knockoutWhiteToTransparent(
  inputPath: string,
  outputPath: string,
  thresh = WHITE_THRESH,
): Promise<{ clearedRatio: number }> {
  // Always read into memory first — Windows locks files opened by sharp/Next.
  const inputBuf = readFileSync(inputPath);
  const { data, info } = await sharp(inputBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const channels = info.channels;
  if (channels < 4) {
    throw new Error(`expected RGBA, got ${channels} channels`);
  }

  const buf = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  const idx = (x: number, y: number) => y * width + x;

  let whiteEdge = 0;
  let blackEdge = 0;
  const sampleEdge = (x: number, y: number) => {
    const o = idx(x, y) * 4;
    const r = buf[o]!;
    const g = buf[o + 1]!;
    const b = buf[o + 2]!;
    if (r >= thresh && g >= thresh && b >= thresh) whiteEdge += 1;
    else if (r <= BLACK_THRESH && g <= BLACK_THRESH && b <= BLACK_THRESH) blackEdge += 1;
  };
  for (let x = 0; x < width; x += Math.max(1, Math.floor(width / 64))) {
    sampleEdge(x, 0);
    sampleEdge(x, height - 1);
  }
  for (let y = 0; y < height; y += Math.max(1, Math.floor(height / 64))) {
    sampleEdge(0, y);
    sampleEdge(width - 1, y);
  }
  const clearWhite = whiteEdge >= blackEdge;
  const clearBlack = blackEdge > whiteEdge;

  const isBg = (i: number) => {
    const o = i * 4;
    const r = buf[o]!;
    const g = buf[o + 1]!;
    const b = buf[o + 2]!;
    if (clearWhite && r >= thresh && g >= thresh && b >= thresh) return true;
    if (clearBlack && r <= BLACK_THRESH && g <= BLACK_THRESH && b <= BLACK_THRESH) {
      return true;
    }
    return false;
  };

  const enqueue = (x: number, y: number) => {
    const i = idx(x, y);
    if (visited[i]) return;
    if (!isBg(i)) return;
    visited[i] = 1;
    queue[qt++] = i;
  };

  for (let x = 0; x < width; x++) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  while (qh < qt) {
    const i = queue[qh++]!;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < width) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < height) enqueue(x, y + 1);
  }

  let cleared = 0;
  for (let i = 0; i < visited.length; i++) {
    if (!visited[i]) continue;
    buf[i * 4 + 3] = 0;
    cleared += 1;
  }

  const outBuf = await sharp(buf, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 })
    .toBuffer();

  writeFileSync(outputPath, outBuf);

  return { clearedRatio: cleared / (width * height) };
}

/** Download target → transparent webp beside it; remove opaque original. */
export async function processMicroinformPackshot(
  downloadedPath: string,
): Promise<string> {
  const dir = path.dirname(downloadedPath);
  const base = path.basename(downloadedPath, path.extname(downloadedPath));
  const webpPath = path.join(dir, `${base}.webp`);
  const tmpPath = path.join(dir, `${base}.knockout.tmp.webp`);

  await knockoutWhiteToTransparent(downloadedPath, tmpPath);
  const out = readFileSync(tmpPath);
  try {
    unlinkSync(tmpPath);
  } catch {
    /* ignore */
  }

  // Replace destination via write (avoids Windows rename locks).
  writeFileSync(webpPath, out);

  if (path.resolve(downloadedPath) !== path.resolve(webpPath)) {
    try {
      if (existsSync(downloadedPath)) unlinkSync(downloadedPath);
    } catch {
      /* ignore */
    }
  }

  return webpPath;
}
