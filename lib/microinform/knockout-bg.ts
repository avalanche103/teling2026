import { renameSync, unlinkSync } from "fs";
import path from "path";
import sharp from "sharp";

/** Near-white threshold for manufacturer packshots (D-Link / Origo). */
const WHITE_THRESH = 248;

/**
 * Flood-fill near-white background from image edges → transparent alpha.
 * Matches SSD cutouts so catalog `bg-slate-100` shows through as gray.
 */
export async function knockoutWhiteToTransparent(
  inputPath: string,
  outputPath: string,
  thresh = WHITE_THRESH,
): Promise<{ clearedRatio: number }> {
  const { data, info } = await sharp(inputPath)
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

  const isNearWhite = (i: number) => {
    const o = i * 4;
    return buf[o]! >= thresh && buf[o + 1]! >= thresh && buf[o + 2]! >= thresh;
  };

  const enqueue = (x: number, y: number) => {
    const i = idx(x, y);
    if (visited[i]) return;
    if (!isNearWhite(i)) return;
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

  await sharp(buf, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 })
    .toFile(outputPath);

  return { clearedRatio: cleared / (width * height) };
}

/** Download target → transparent webp beside it; remove opaque original. */
export async function processMicroinformPackshot(
  downloadedPath: string,
): Promise<string> {
  const dir = path.dirname(downloadedPath);
  const base = path.basename(downloadedPath, path.extname(downloadedPath));
  const webpPath = path.join(dir, `${base}.webp`);
  const samePath = path.resolve(downloadedPath) === path.resolve(webpPath);
  const targetPath = samePath
    ? path.join(dir, `${base}.knockout.tmp.webp`)
    : webpPath;

  await knockoutWhiteToTransparent(downloadedPath, targetPath);

  if (samePath) {
    try {
      unlinkSync(downloadedPath);
    } catch {
      /* ignore */
    }
    renameSync(targetPath, webpPath);
  } else {
    try {
      unlinkSync(downloadedPath);
    } catch {
      /* ignore */
    }
  }

  return webpPath;
}
