/**
 * Out-of-process product import worker for low-RAM VPS.
 * Usage: node --max-old-space-size=512 scripts/product-import-worker.mjs <analyze|apply> [--cwd <dir>]
 *
 * Analyze streams the upload JSON, writes NDJSON snapshot + slim preview.
 * Apply streams NDJSON and writes products.json atomically.
 */
import {
  createReadStream,
  createWriteStream,
  existsSync,
  readFileSync,
  writeFileSync,
  openSync,
  closeSync,
  fsyncSync,
  renameSync,
  unlinkSync,
  readSync,
} from "node:fs";
import { once } from "node:events";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { finished } from "node:stream/promises";
import chain from "stream-chain";
import { parser } from "stream-json";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { pick } from "stream-json/filters/pick.js";

function parseArgs(argv) {
  const args = { command: null, cwd: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--cwd") {
      args.cwd = path.resolve(argv[++i] ?? process.cwd());
    } else if (!a.startsWith("-") && !args.command) {
      args.command = a;
    }
  }
  return args;
}

function dataPath(cwd, ...parts) {
  return path.join(cwd, "data", ...parts);
}

function getProductName(product) {
  if (typeof product.custom_name === "string" && product.custom_name.trim()) return product.custom_name.trim();
  if (typeof product.name === "string" && product.name.trim()) return product.name.trim();
  if (typeof product.original_name === "string" && product.original_name.trim()) return product.original_name.trim();
  return "Без названия";
}

function toAdminListItem(product) {
  return {
    id: product.id,
    sku: typeof product.sku === "string" ? product.sku.trim() : "",
    name: getProductName(product),
    originalName: typeof product.original_name === "string" ? product.original_name : "",
    customName: typeof product.custom_name === "string" ? product.custom_name : null,
    sectionId: product.section_id,
    sectionName: product.section_name,
    brand: product.metadata?.brand || product.vendor || "",
    vendor: product.vendor || "",
    price: product.price,
    priceWithoutVat: product.price_without_vat,
    currency: product.currency,
    visible: product.visible !== false,
  };
}

function toPreviewProduct(product, importKey) {
  return {
    importKey,
    id: product.id,
    sku: typeof product.sku === "string" ? product.sku.trim() : "",
    name: getProductName(product),
    sectionName: product.section_name,
    brand: product.metadata?.brand || product.vendor || "",
    price: product.price,
    currency: product.currency,
  };
}

function detectTopLevel(filePath) {
  const fd = openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(512);
    const bytes = readSync(fd, buf, 0, 512, 0);
    const text = buf.toString("utf8", 0, bytes);
    for (const ch of text) {
      if (ch === " " || ch === "\n" || ch === "\r" || ch === "\t") continue;
      if (ch === "[") return "array";
      if (ch === "{") return "object";
      throw new Error("Ожидается JSON-массив товаров или объект с полем products");
    }
    throw new Error("Пустой JSON-файл");
  } finally {
    closeSync(fd);
  }
}

async function forEachArrayItem(filePath, onItem) {
  const kind = detectTopLevel(filePath);
  const stages = [createReadStream(filePath), parser()];
  if (kind === "object") {
    stages.push(pick({ filter: "products" }));
  }
  stages.push(streamArray());

  const pipeline = chain(stages);
  let index = 0;
  for await (const chunk of pipeline) {
    await onItem(chunk.value, index);
    index += 1;
  }
  return index;
}

async function forEachNdjson(filePath, onItem) {
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let index = 0;
  for await (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    await onItem(JSON.parse(trimmed), index);
    index += 1;
  }
  return index;
}

function classifyIncoming(incomingProduct, index, ctx) {
  const importKey = `import-${index}`;
  const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";
  const currentSkuMatch = incomingSku ? ctx.currentBySku.get(incomingSku) ?? null : null;
  const currentIdMatch = ctx.currentById.get(incomingProduct.id) ?? null;
  const duplicateInImport =
    (ctx.incomingIdCounts.get(incomingProduct.id) ?? 0) > 1 ||
    Boolean(incomingSku && (ctx.incomingSkuCounts.get(incomingSku) ?? 0) > 1);

  if (duplicateInImport) {
    if (currentSkuMatch) ctx.conflictCurrentIds.add(currentSkuMatch.id);
    if (currentIdMatch) ctx.conflictCurrentIds.add(currentIdMatch.id);
    ctx.conflicts.push({
      ...toPreviewProduct(incomingProduct, importKey),
      conflictType: "duplicate",
      currentBySku: currentSkuMatch,
      currentById: currentIdMatch,
    });
    return;
  }

  if (currentSkuMatch && currentIdMatch) {
    if (currentSkuMatch.id === currentIdMatch.id) {
      ctx.exactMatchCount += 1;
      ctx.exactMatchedCurrentIds.add(currentSkuMatch.id);
      return;
    }
    ctx.conflictCurrentIds.add(currentSkuMatch.id);
    ctx.conflictCurrentIds.add(currentIdMatch.id);
    ctx.conflicts.push({
      ...toPreviewProduct(incomingProduct, importKey),
      conflictType: "cross",
      currentBySku: currentSkuMatch,
      currentById: currentIdMatch,
    });
    return;
  }

  if (currentSkuMatch) {
    ctx.conflictCurrentIds.add(currentSkuMatch.id);
    ctx.conflicts.push({
      ...toPreviewProduct(incomingProduct, importKey),
      conflictType: "sku",
      currentBySku: currentSkuMatch,
      currentById: null,
    });
    return;
  }

  if (currentIdMatch) {
    ctx.conflictCurrentIds.add(currentIdMatch.id);
    ctx.conflicts.push({
      ...toPreviewProduct(incomingProduct, importKey),
      conflictType: "id",
      currentBySku: null,
      currentById: currentIdMatch,
    });
    return;
  }

  ctx.newProducts.push(toPreviewProduct(incomingProduct, importKey));
}

function mergeImportedIntoCurrent(currentProduct, incomingProduct) {
  return {
    ...incomingProduct,
    id: currentProduct.id,
    sku: currentProduct.sku,
    visible: currentProduct.visible,
    custom_name: currentProduct.custom_name,
    price_override: currentProduct.price_override,
  };
}

async function loadCurrentSlimIndex(productsPath) {
  const currentById = new Map();
  const currentBySku = new Map();
  const currentListItems = [];

  await forEachArrayItem(productsPath, (product) => {
    const item = toAdminListItem(product);
    currentById.set(item.id, item);
    currentListItems.push(item);
    if (item.sku) currentBySku.set(item.sku, item);
  });

  return { currentById, currentBySku, currentListItems, currentCount: currentListItems.length };
}

async function analyze(cwd) {
  const productsPath = dataPath(cwd, "products.json");
  const uploadPath = dataPath(cwd, "products.import.upload.json");
  const ndjsonPath = dataPath(cwd, "products.import.ndjson");
  const metaPath = dataPath(cwd, "products.import.meta.json");
  const previewPath = dataPath(cwd, "products.import.preview.json");

  if (!existsSync(uploadPath)) {
    throw new Error("Файл data/products.import.upload.json не найден");
  }
  if (!existsSync(productsPath)) {
    throw new Error("Файл data/products.json не найден");
  }

  const { currentById, currentBySku, currentListItems, currentCount } = await loadCurrentSlimIndex(productsPath);

  const incomingIdCounts = new Map();
  const incomingSkuCounts = new Map();
  const ndjsonOut = createWriteStream(ndjsonPath, { encoding: "utf8" });

  const incomingCount = await forEachArrayItem(uploadPath, async (product) => {
    incomingIdCounts.set(product.id, (incomingIdCounts.get(product.id) ?? 0) + 1);
    const sku = typeof product.sku === "string" ? product.sku.trim() : "";
    if (sku) incomingSkuCounts.set(sku, (incomingSkuCounts.get(sku) ?? 0) + 1);
    if (!ndjsonOut.write(JSON.stringify(product) + "\n")) {
      await once(ndjsonOut, "drain");
    }
  });
  ndjsonOut.end();
  await finished(ndjsonOut);

  const ctx = {
    currentById,
    currentBySku,
    incomingIdCounts,
    incomingSkuCounts,
    newProducts: [],
    conflicts: [],
    exactMatchedCurrentIds: new Set(),
    conflictCurrentIds: new Set(),
    exactMatchCount: 0,
  };

  await forEachNdjson(ndjsonPath, (product, index) => {
    classifyIncoming(product, index, ctx);
  });

  const missingProducts = currentListItems
    .filter((item) => !ctx.exactMatchedCurrentIds.has(item.id) && !ctx.conflictCurrentIds.has(item.id))
    .map((item) => ({
      currentKey: `current-${item.id}`,
      product: item,
    }));

  const token = randomUUID();
  const importedAt = new Date().toISOString();
  const filename = "products.import.upload.json";

  const preview = {
    token,
    importedAt,
    currentCount,
    incomingCount,
    exactMatchCount: ctx.exactMatchCount,
    newProducts: ctx.newProducts,
    conflicts: ctx.conflicts,
    missingProducts,
  };

  const meta = {
    token,
    importedAt,
    filename,
    currentCount,
    incomingCount,
    exactMatchCount: ctx.exactMatchCount,
  };

  writeFileSync(metaPath, JSON.stringify(meta), "utf8");
  writeFileSync(previewPath, JSON.stringify(preview), "utf8");

  process.stdout.write(JSON.stringify({ ok: true, token, previewPath: "data/products.import.preview.json" }) + "\n");
}

async function loadCurrentFull(productsPath) {
  const products = [];
  const byId = new Map();
  const bySku = new Map();
  const indexById = new Map();

  await forEachArrayItem(productsPath, (product) => {
    const index = products.length;
    products.push(product);
    byId.set(product.id, product);
    indexById.set(product.id, index);
    const sku = typeof product.sku === "string" ? product.sku.trim() : "";
    if (sku) bySku.set(sku, product);
  });

  return { products, byId, bySku, indexById };
}

async function writeProductsAtomic(productsPath, products) {
  const tmpPath = `${productsPath}.tmp`;
  const out = createWriteStream(tmpPath, { encoding: "utf8" });
  out.write("[\n");
  for (let i = 0; i < products.length; i++) {
    const pretty = JSON.stringify(products[i], null, 2)
      .split("\n")
      .map((line) => `  ${line}`)
      .join("\n");
    const ok = out.write(pretty + (i < products.length - 1 ? ",\n" : "\n"));
    if (!ok) await once(out, "drain");
  }
  out.write("]\n");
  out.end();
  await finished(out);

  const fd = openSync(tmpPath, "r+");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, productsPath);
}

async function apply(cwd) {
  const productsPath = dataPath(cwd, "products.json");
  const metaPath = dataPath(cwd, "products.import.meta.json");
  const previewPath = dataPath(cwd, "products.import.preview.json");
  const ndjsonPath = dataPath(cwd, "products.import.ndjson");
  const actionsPath = dataPath(cwd, "products.import.actions.json");
  const resultPath = dataPath(cwd, "products.import.result.json");

  if (!existsSync(metaPath) || !existsSync(previewPath) || !existsSync(ndjsonPath)) {
    throw new Error("Предпросмотр импорта устарел. Загрузите JSON заново.");
  }
  if (!existsSync(actionsPath)) {
    throw new Error("Файл действий импорта не найден");
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  const preview = JSON.parse(readFileSync(previewPath, "utf8"));
  const actions = JSON.parse(readFileSync(actionsPath, "utf8"));

  if (!actions.token || actions.token !== meta.token || actions.token !== preview.token) {
    throw new Error("Предпросмотр импорта устарел. Загрузите JSON заново.");
  }

  const newKeysToAdd = new Set(actions.addNewProductKeys ?? []);
  const conflictActions = actions.conflictActions ?? {};
  const missingActions = actions.missingActions ?? {};
  const conflictKeySet = new Set(preview.conflicts.map((item) => item.importKey));
  const newKeySet = new Set(preview.newProducts.map((item) => item.importKey));

  const { products, byId, bySku, indexById } = await loadCurrentFull(productsPath);

  let addedCount = 0;
  let updatedCount = 0;
  let hiddenCount = 0;
  let deletedCount = 0;

  const setById = (id, next) => {
    const idx = indexById.get(id);
    if (idx === undefined) return;
    products[idx] = next;
    byId.set(id, next);
    const sku = typeof next.sku === "string" ? next.sku.trim() : "";
    if (sku) bySku.set(sku, next);
  };

  await forEachNdjson(ndjsonPath, (incomingProduct, index) => {
    const importKey = `import-${index}`;

    if (conflictKeySet.has(importKey)) {
      const action = conflictActions[importKey] ?? "skip";
      if (action === "skip") return;

      const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";
      let target = null;
      if (action === "use-sku" && incomingSku) target = bySku.get(incomingSku) ?? null;
      else if (action === "use-id") target = byId.get(incomingProduct.id) ?? null;
      if (!target) return;

      setById(target.id, mergeImportedIntoCurrent(target, incomingProduct));
      updatedCount += 1;
      return;
    }

    if (newKeySet.has(importKey)) {
      if (!newKeysToAdd.has(importKey)) return;
      const next = {
        ...incomingProduct,
        visible: incomingProduct.visible ?? true,
      };
      indexById.set(next.id, products.length);
      products.push(next);
      byId.set(next.id, next);
      const sku = typeof next.sku === "string" ? next.sku.trim() : "";
      if (sku) bySku.set(sku, next);
      addedCount += 1;
      return;
    }

    const incomingSku = typeof incomingProduct.sku === "string" ? incomingProduct.sku.trim() : "";
    const currentProduct = incomingSku
      ? bySku.get(incomingSku) ?? byId.get(incomingProduct.id)
      : byId.get(incomingProduct.id);
    if (!currentProduct) return;
    setById(currentProduct.id, mergeImportedIntoCurrent(currentProduct, incomingProduct));
    updatedCount += 1;
  });

  const deleteIds = new Set();
  const hideIds = new Set();
  for (const missingItem of preview.missingProducts) {
    const action = missingActions[missingItem.currentKey] ?? "keep";
    if (action === "delete") deleteIds.add(missingItem.product.id);
    if (action === "hide") hideIds.add(missingItem.product.id);
  }

  if (hideIds.size > 0) {
    for (const id of hideIds) {
      const current = byId.get(id);
      if (!current) continue;
      if (current.visible !== false) {
        setById(id, { ...current, visible: false });
        hiddenCount += 1;
      }
    }
  }

  let finalProducts = products;
  if (deleteIds.size > 0) {
    const before = products.length;
    finalProducts = products.filter((p) => !deleteIds.has(p.id));
    deletedCount = before - finalProducts.length;
  }

  await writeProductsAtomic(productsPath, finalProducts);

  const result = {
    ok: true,
    filename: meta.filename,
    addedCount,
    updatedCount,
    hiddenCount,
    deletedCount,
    totalCount: finalProducts.length,
  };
  writeFileSync(resultPath, JSON.stringify(result), "utf8");
  process.stdout.write(JSON.stringify(result) + "\n");

  try {
    unlinkSync(actionsPath);
  } catch {
    // ignore
  }
}

function fail(err) {
  const message = err instanceof Error ? err.message : String(err);
  const isOom =
    /heap|allocation failed|out of memory|ENOMEM/i.test(message) ||
    (err instanceof Error && err.name === "RangeError");
  process.stderr.write(
    JSON.stringify({
      ok: false,
      error: isOom
        ? "Не хватает памяти на сервере для разбора JSON. Проверьте swap (≥2G) и повторите анализ файла на сервере."
        : message,
    }) + "\n",
  );
  process.exit(1);
}

const { command, cwd } = parseArgs(process.argv.slice(2));

if (command !== "analyze" && command !== "apply") {
  fail(new Error("Usage: product-import-worker.mjs <analyze|apply> [--cwd <dir>]"));
}

const run = command === "analyze" ? analyze(cwd) : apply(cwd);
run.catch(fail);
