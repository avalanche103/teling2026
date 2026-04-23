import { readFile } from "fs/promises";
import path from "path";
import { type NextRequest } from "next/server";

const PUBLIC_IMAGES_DIR = path.join(process.cwd(), "public", "images");
const LEGACY_IMAGES_DIR = process.env.IMAGES_DIR;

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

function resolveInsideRoot(root: string, filename: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(root, filename);

  if (!resolvedPath.startsWith(resolvedRoot)) {
    return null;
  }

  return resolvedPath;
}

function getImageCandidates(filename: string): string[] {
  const candidates: string[] = [];
  const primaryPath = resolveInsideRoot(PUBLIC_IMAGES_DIR, filename);

  if (primaryPath) {
    candidates.push(primaryPath);
  }

  if (
    LEGACY_IMAGES_DIR &&
    path.resolve(LEGACY_IMAGES_DIR) !== path.resolve(PUBLIC_IMAGES_DIR)
  ) {
    const legacyPath = resolveInsideRoot(LEGACY_IMAGES_DIR, filename);
    if (legacyPath) {
      candidates.push(legacyPath);
    }
  }

  return candidates;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;

  const filename = pathParts.join("/");
  if (filename.includes("..") || filename.includes("\\")) {
    return new Response("Forbidden", { status: 403 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

  for (const candidate of getImageCandidates(filename)) {
    try {
      const data = await readFile(candidate);

      return new Response(data, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      // Try the next configured image source.
    }
  }

  return new Response("Not Found", { status: 404 });
}
