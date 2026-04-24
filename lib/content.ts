import { promises as fs } from "fs";
import path from "path";
import type { ContentBlock } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");

export async function readContent(): Promise<ContentBlock[]> {
  try {
    const data = await fs.readFile(CONTENT_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    // Return default content if file doesn't exist
    return [
      {
        id: "hero",
        key: "hero",
        title: "Основной баннер",
        content: "Добро пожаловать в Teling",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "about",
        key: "about",
        title: "О компании",
        content: "Информация о компании",
        updatedAt: new Date().toISOString(),
      },
      {
        id: "contacts",
        key: "contacts",
        title: "Контакты",
        content: "Контактная информация",
        updatedAt: new Date().toISOString(),
      },
    ];
  }
}

export async function getContentBlock(
  key: "hero" | "about" | "contacts"
): Promise<ContentBlock | null> {
  const content = await readContent();
  return content.find((c) => c.key === key) || null;
}

export async function updateContentBlock(
  key: "hero" | "about" | "contacts",
  updates: Partial<ContentBlock>
): Promise<ContentBlock> {
  const content = await readContent();
  const index = content.findIndex((c) => c.key === key);

  if (index === -1) {
    throw new Error(`Content block not found: ${key}`);
  }

  const updated: ContentBlock = {
    ...content[index],
    ...updates,
    key, // Don't allow key to be changed
    updatedAt: new Date().toISOString(),
  };

  content[index] = updated;
  await fs.writeFile(CONTENT_FILE, JSON.stringify(content, null, 2));

  return updated;
}

export async function getAllContent(): Promise<ContentBlock[]> {
  return readContent();
}
