#!/usr/bin/env python3
"""SSD партнер API -> SQLite импорт"""

import json
import logging
import sqlite3
import time
import argparse
from pathlib import Path

import requests

from catalog_utils import ensure_product_overrides_table

API_KEY = "49078:67660f3465c49b9480a20afb8b791cbd"
BASE_URL = "https://ssd.ru/api/partner/catalog"
DB_PATH = Path("ssd_catalog.db")
CHECKPOINT_PATH = Path("checkpoint.txt")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")


def save_checkpoint(page):
    """Save current page to checkpoint file"""
    CHECKPOINT_PATH.write_text(str(page))


def load_checkpoint():
    """Load last successful page from checkpoint"""
    if CHECKPOINT_PATH.exists():
        try:
            return int(CHECKPOINT_PATH.read_text().strip())
        except ValueError:
            pass
    return 1


def request_json(endpoint, params=None, retries=3, backoff=2):
    url = f"{BASE_URL}/{endpoint.lstrip('/') }"
    headers = {"APIKEY": API_KEY}
    for attempt in range(1, retries + 1):
        try:
            logging.info("GET %s params=%s (attempt %s)", url, params, attempt)
            r = requests.get(url, headers=headers, params=params or {}, timeout=90)
            r.raise_for_status()
            data = r.json()
            logging.info("OK %s", url)
            return data
        except requests.RequestException as e:
            logging.warning("Request failed (%s): %s", attempt, e)
            if attempt < retries:
                time.sleep(backoff ** attempt)
                continue
            raise
        except json.JSONDecodeError as e:
            logging.error("JSON decode error for %s: %s", url, e)
            raise


def normalize_list(obj):
    if obj is None:
        return []
    if isinstance(obj, list):
        return obj
    if isinstance(obj, dict):
        # handle paginated response wrapper: {'success':..., 'data': {'items': [...]}}
        if "data" in obj:
            data = obj["data"]
            if isinstance(data, list):
                return data
            if isinstance(data, dict):
                if "items" in data and isinstance(data["items"], list):
                    return data["items"]
                # some endpoints may wrap directly in data as object
                return normalize_list(data)
        # direct wrappers
        for key in ("items", "sections", "products", "result"):
            if key in obj and isinstance(obj[key], list):
                return obj[key]
        # fallback: if the dict itself looks like a product/section with id/name
        if any(k in obj for k in ("id", "ID", "name", "title")):
            return [obj]
        return []
    return []


def init_db(conn: sqlite3.Connection):
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS sections (
        id INTEGER PRIMARY KEY,
        name TEXT,
        parent INTEGER,
        external_id TEXT,
        metadata TEXT,
        exclude_from_export INTEGER DEFAULT 0
    )
    """)
    c.execute("""
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT,
        sku TEXT,
        section_id INTEGER,
        price REAL,
        stock INTEGER,
        vendor TEXT,
        metadata TEXT,
        raw_json TEXT
    )
    """)
    c.execute("""
    CREATE INDEX IF NOT EXISTS idx_products_section ON products(section_id)
    """)
    ensure_product_overrides_table(conn)
    conn.commit()


def upsert_section(conn: sqlite3.Connection, section: dict):
    c = conn.cursor()
    id_ = section.get("id") or section.get("ID") or section.get("sectionId")
    name = section.get("name") or section.get("title") or section.get("Name")

    parent = section.get("parent")
    if parent is None:
        parent = section.get("parentId")
    if parent is None:
        parent = section.get("parent_id")

    # Normalize parent id value
    if parent in ("", "null"):
        parent = None
    if parent is not None:
        try:
            parent = int(parent)
            if parent == 0:
                parent = None
        except (TypeError, ValueError):
            parent = None

    external_id = section.get("externalId") or section.get("code")
    metadata = json.dumps(section, ensure_ascii=False)
    if id_ is None:
        logging.warning("Skipping section without id: %s", section)
        return
    c.execute(
        "INSERT OR REPLACE INTO sections (id, name, parent, external_id, metadata, exclude_from_export) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT exclude_from_export FROM sections WHERE id = ?), 0))",
        (id_, name, parent, external_id, metadata, id_),
    )


def upsert_product(conn: sqlite3.Connection, product: dict):
    c = conn.cursor()
    id_ = product.get("id") or product.get("ID") or product.get("productId")
    name = product.get("name") or product.get("title") or product.get("Name")

    # sku/articul
    sku = (
        product.get("sku")
        or product.get("article")
        or product.get("articul")
        or product.get("code")
    )

    # section
    section_id = (
        product.get("section_id")
        or product.get("groupId")
        or product.get("categoryId")
    )
    sections_list = product.get("sections") or product.get("section")
    if not section_id and isinstance(sections_list, list) and sections_list:
        section_id = sections_list[0]

    # price
    price = None
    for key in ("price", "priceOpt", "priceRetail", "Cost", "cost"):
        if product.get(key) is not None:
            try:
                price = float(product.get(key))
                break
            except (TypeError, ValueError):
                pass
    if price is None and isinstance(product.get("offer"), dict):
        offer = product.get("offer")
        for key in ("price", "optPrice", "priceRealize", "minPriceRealize"):
            if offer.get(key) is not None:
                try:
                    price = float(offer.get(key))
                    break
                except (TypeError, ValueError):
                    pass

    # stock
    stock = None
    for key in ("availableQty", "availableQty", "stock", "count", "balance"):
        if product.get(key) is not None:
            try:
                stock = int(product.get(key))
                break
            except (TypeError, ValueError):
                pass
    if stock is None and isinstance(product.get("offer"), dict):
        try:
            stock = int(product.get("offer").get("availableQty"))
        except Exception:
            pass

    vendor = (
        product.get("vendor")
        or product.get("manufacturer")
        or product.get("brand")
        or product.get("company")
    )

    metadata = json.dumps(
        {k: product[k] for k in product if k not in ("id", "name", "sku", "section_id")},
        ensure_ascii=False,
    )
    raw_json = json.dumps(product, ensure_ascii=False)

    if id_ is None:
        logging.warning("Skipping product without id: %s", product)
        return

    c.execute(
        "INSERT OR REPLACE INTO products (id, name, sku, section_id, price, stock, vendor, metadata, raw_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (id_, name, sku, section_id, price, stock, vendor, metadata, raw_json),
    )


def fetch_sections(conn):
    raw = request_json("sections")
    sections = normalize_list(raw)
    logging.info("Found %s sections", len(sections))
    for s in sections:
        upsert_section(conn, s)
    conn.commit()


def repair_section_parents(conn):
    """Backfill missing parent links from section metadata."""
    c = conn.cursor()
    updated = 0
    rows = c.execute("SELECT id, parent, metadata FROM sections").fetchall()
    for sid, parent, metadata in rows:
        if parent is not None:
            continue
        try:
            section = json.loads(metadata or "{}")
        except json.JSONDecodeError:
            continue
        parent_id = section.get("parent") or section.get("parentId") or section.get("parent_id")
        if parent_id in (None, "", "null"):
            continue
        try:
            parent_id = int(parent_id)
            if parent_id == 0:
                continue
            c.execute("UPDATE sections SET parent = ? WHERE id = ?", (parent_id, sid))
            updated += 1
        except (TypeError, ValueError):
            continue
    if updated:
        conn.commit()
        logging.info("Backfilled %s section parent links", updated)
    return updated


def fetch_products(conn):
    start_page = load_checkpoint()
    page = start_page
    page_size = 200
    total_saved = 0
    total_pages = None
    max_pages = 50  # safety limit to avoid infinite loops

    logging.info("Starting from page %s", page)

    while True:
        params = {"page": page, "limit": page_size}

        try:
            raw = request_json("products", params=params)
        except Exception as e:
            logging.error("Failed to fetch products page %s: %s", page, e)
            break

        if isinstance(raw, dict) and "data" in raw and isinstance(raw["data"], dict):
            metadata = raw["data"]
            total_pages = total_pages or metadata.get("totalPages")
            current_page = metadata.get("currentPage")
            products = normalize_list(metadata)
        else:
            products = normalize_list(raw)

        if not products:
            logging.info("No products returned on page %s, stopping.", page)
            break

        logging.info("Page %s/%s: got %s products", page, total_pages or "?", len(products))
        for prod in products:
            upsert_product(conn, prod)
            total_saved += 1

        conn.commit()
        save_checkpoint(page)

        if total_pages is not None:
            if page >= total_pages:
                break
        elif len(products) < page_size:
            break

        page += 1
        if page > max_pages:
            logging.warning("Reached max pages limit (%s), stopping to prevent infinite loop", max_pages)
            break

        time.sleep(0.5)

    logging.info("Total products imported: %s", total_saved)


def main():
    parser = argparse.ArgumentParser(description="SSD catalog import")
    parser.add_argument("--reset", action="store_true", help="Reset checkpoint and start from page 1")
    args = parser.parse_args()

    if args.reset and CHECKPOINT_PATH.exists():
        CHECKPOINT_PATH.unlink()
        logging.info("Checkpoint reset")

    logging.info("Starting SSD catalog import")
    with sqlite3.connect(DB_PATH) as conn:
        init_db(conn)
        try:
            fetch_sections(conn)
            repair_section_parents(conn)
        except Exception as e:
            logging.error("Sections fetch/repair failed: %s", e)

        try:
            fetch_products(conn)
        except Exception as e:
            logging.error("Products fetch failed: %s", e)

    logging.info("Done. DB saved to %s", DB_PATH)


if __name__ == "__main__":
    main()
