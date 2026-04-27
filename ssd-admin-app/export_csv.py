#!/usr/bin/env python3
"""Экспорт SSD каталога в CSV"""

import csv
import sqlite3
from pathlib import Path

from catalog_utils import (
    apply_product_overrides,
    build_export_pricing,
    ensure_product_overrides_table,
    extract_offer_fields,
    safe_json_loads,
)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ssd_catalog.db"
EXPORT_DIR = BASE_DIR / "export"
EXPORT_DIR.mkdir(exist_ok=True)


def export_products_csv():
    """Экспорт продуктов в CSV с учетом пользовательских правок и BYN-цен."""
    with sqlite3.connect(DB_PATH) as conn:
        ensure_product_overrides_table(conn)
        c = conn.cursor()
        rows = c.execute(
            """
            SELECT p.id, p.name, p.sku, p.section_id, p.price, p.stock, p.vendor,
                 s.name as section_name, p.raw_json, o.custom_name, o.custom_vendor, o.price_override
            FROM products p
            LEFT JOIN sections s ON p.section_id = s.id
            LEFT JOIN product_overrides o ON o.product_id = p.id
            WHERE COALESCE(o.hide_from_export, 0) = 0
            ORDER BY p.id
            """
        ).fetchall()

    with open(EXPORT_DIR / "products.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "id",
            "name",
            "original_name",
            "custom_name",
            "custom_vendor",
            "sku",
            "section_id",
            "section_name",
            "price_byn",
            "currency",
            "source_price_rub",
            "calculated_price_byn",
            "price_override_byn",
            "price_without_vat",
            "vat_amount",
            "markup_percent",
            "distributor_discount",
            "opt_discount",
            "stock",
            "vendor",
            "original_vendor",
            "description",
            "images",
        ])

        for row in rows:
            id_, name, sku, section_id, price, stock, vendor, section_name, raw_json, custom_name, custom_vendor, price_override = row
            raw = safe_json_loads(raw_json, {})
            offer_fields = extract_offer_fields(raw_json)
            pricing = build_export_pricing(price, offer_fields["distributor_discount"], price_override)
            effective = apply_product_overrides(name, pricing["price"], custom_name, vendor, custom_vendor, price_override)
            description = raw.get("description", "") if isinstance(raw, dict) else ""
            pictures = raw.get("pictures", []) if isinstance(raw, dict) else []
            images = ";".join(pictures) if pictures else ""

            writer.writerow([
                id_,
                effective["name"],
                name,
                custom_name,
                custom_vendor,
                sku,
                section_id,
                section_name,
                pricing["price"],
                pricing["currency"],
                pricing["source_price_rub"],
                pricing["calculated_price"],
                pricing["price_override"],
                pricing["price_without_vat"],
                pricing["vat_amount"],
                pricing["markup_percent"],
                offer_fields["distributor_discount"],
                offer_fields["opt_discount"],
                stock,
                effective["vendor"],
                vendor,
                description,
                images,
            ])

    print(f"Exported {len(rows)} products to {EXPORT_DIR / 'products.csv'}")


def export_sections_csv():
    """Экспорт разделов в CSV"""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        rows = c.execute("SELECT id, name, parent, external_id FROM sections ORDER BY id").fetchall()

    with open(EXPORT_DIR / "sections.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "name", "parent", "external_id"])

        for row in rows:
            writer.writerow(row)

    print(f"Exported {len(rows)} sections to {EXPORT_DIR / 'sections.csv'}")


def main():
    print("Starting CSV export...")
    export_sections_csv()
    export_products_csv()
    print("CSV export complete.")


if __name__ == "__main__":
    main()
