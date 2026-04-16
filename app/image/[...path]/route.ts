import { readFile } from "fs/promises";
import path from "path";
import { type NextRequest } from "next/server";

const IMAGES_DIR =
  process.env.IMAGES_DIR ||
  path.join(process.cwd(), "public", "images");

const CONTENT_TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathParts } = await params;

  const filename = pathParts.join("/");
  if (filename.includes("..") || filename.includes("\\")) {
    return new Response("Forbidden", { status: 403 });
  }

  const resolvedRoot = path.resolve(IMAGES_DIR);
  const resolvedPath = path.resolve(IMAGES_DIR, filename);
  if (!resolvedPath.startsWith(resolvedRoot)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const data = await readFile(resolvedPath);
    const ext = path.extname(filename).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    return new Response(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}
