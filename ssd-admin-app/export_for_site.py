#!/usr/bin/env python3
"""Экспорт SSD каталога для сайта"""

import argparse
import json
import sqlite3
from pathlib import Path

from catalog_utils import (
    DEFAULT_EXPORT_DIR,
    apply_product_overrides,
    build_export_pricing,
    ensure_product_overrides_table,
    extract_offer_fields,
    resolve_export_dir,
    safe_json_loads,
)

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ssd_catalog.db"
EXPORT_DIR = DEFAULT_EXPORT_DIR


def configure_export_dir(raw_path: str | None = None) -> Path:
    """Установить папку экспорта для текущего запуска."""
    global EXPORT_DIR
    if raw_path:
        EXPORT_DIR = resolve_export_dir(raw_path)
    else:
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    return EXPORT_DIR


def get_excluded_section_ids(conn):
    c = conn.cursor()
    rows = c.execute("SELECT id, parent, COALESCE(exclude_from_export, 0) FROM sections").fetchall()
    children = {}
    for sid, parent, _ in rows:
        children.setdefault(parent, []).append(sid)

    excluded = {sid for sid, _, ex in rows if ex}

    # propagate exclusion to descendants
    stack = list(excluded)
    while stack:
        cur = stack.pop()
        for ch in children.get(cur, []):
            if ch not in excluded:
                excluded.add(ch)
                stack.append(ch)

    return excluded


def export_sections():
    """Экспорт разделов в JSON"""
    with sqlite3.connect(DB_PATH) as conn:
        c = conn.cursor()
        excluded = get_excluded_section_ids(conn)
        rows = c.execute("SELECT id, name, parent, external_id, metadata FROM sections ORDER BY id").fetchall()
        sections = []
        for row in rows:
            id_, name, parent, external_id, metadata = row
            if id_ in excluded:
                continue
            sections.append({
                "id": id_,
                "name": name,
                "parent": parent,
                "external_id": external_id,
                "metadata": safe_json_loads(metadata, {}),
            })
        with open(EXPORT_DIR / "sections.json", "w", encoding="utf-8") as f:
            json.dump(sections, f, ensure_ascii=False, indent=2)
        print(f"Exported {len(sections)} sections to {EXPORT_DIR / 'sections.json'}")


def export_products():
    """Экспорт продуктов в JSON с BYN-ценой и пользовательскими правками."""
    with sqlite3.connect(DB_PATH) as conn:
        ensure_product_overrides_table(conn)
        c = conn.cursor()
        excluded = get_excluded_section_ids(conn)
        rows = c.execute(
            """
            SELECT p.id, p.name, p.sku, p.section_id, p.price, p.stock, p.vendor, p.metadata, p.raw_json,
                   s.name as section_name, o.custom_name, o.custom_vendor, o.price_override
            FROM products p
            LEFT JOIN sections s ON p.section_id = s.id
            LEFT JOIN product_overrides o ON o.product_id = p.id
            WHERE COALESCE(o.hide_from_export, 0) = 0
            ORDER BY p.id
            """
        ).fetchall()
        products = []
        for row in rows:
            id_, name, sku, section_id, price, stock, vendor, metadata, raw_json, section_name, custom_name, custom_vendor, price_override = row
            if section_id in excluded:
                continue
            offer_fields = extract_offer_fields(raw_json)
            pricing = build_export_pricing(price, offer_fields["distributor_discount"], price_override)
            effective = apply_product_overrides(name, pricing["price"], custom_name, vendor, custom_vendor, price_override)
            products.append({
                "id": id_,
                "name": effective["name"],
                "original_name": name,
                "custom_name": custom_name,
                "sku": sku,
                "section_id": section_id,
                "section_name": section_name,
                "price": pricing["price"],
                "original_price": price,
                "original_price_rub": pricing["source_price_rub"],
                "calculated_price": pricing["calculated_price"],
                "price_override": pricing["price_override"],
                "price_without_vat": pricing["price_without_vat"],
                "vat_amount": pricing["vat_amount"],
                "markup_percent": pricing["markup_percent"],
                "rub_to_byn_rate": pricing["rub_to_byn_rate"],
                "currency": pricing["currency"],
                "currency_code": pricing["currency_code"],
                "pricing_rule": pricing["pricing_rule"],
                "stock": stock,
                "vendor": effective["vendor"],
                "original_vendor": vendor,
                "custom_vendor": custom_vendor,
                "name_overridden": effective["name_overridden"],
                "vendor_overridden": effective["vendor_overridden"],
                "price_overridden": pricing["price_overridden"],
                **offer_fields,
                "metadata": safe_json_loads(metadata, {}),
                "raw_json": safe_json_loads(raw_json, {}),
            })
        with open(EXPORT_DIR / "products.json", "w", encoding="utf-8") as f:
            json.dump(products, f, ensure_ascii=False, indent=2)
        print(f"Exported {len(products)} products to {EXPORT_DIR / 'products.json'}")


def export_catalog_tree():
    """Экспорт дерева каталога: разделы с продуктами и итоговой BYN-ценой."""
    with sqlite3.connect(DB_PATH) as conn:
        ensure_product_overrides_table(conn)
        c = conn.cursor()

        sections = {}
        rows = c.execute("SELECT id, name, parent, COALESCE(exclude_from_export, 0) FROM sections").fetchall()
        excluded = {sid for sid, _, _, ex in rows if ex}
        child_map = {}
        for sid, name, parent, ex in rows:
            sections[sid] = {"id": sid, "name": name, "parent": parent, "products": []}
            child_map.setdefault(parent, []).append(sid)

        # propagate exclusion to descendants
        all_excluded = set(excluded)
        stack = list(excluded)
        while stack:
            cur = stack.pop()
            for ch in child_map.get(cur, []):
                if ch not in all_excluded:
                    all_excluded.add(ch)
                    stack.append(ch)

        rows = c.execute(
            """
            SELECT p.id, p.name, p.sku, p.section_id, p.price, p.stock, p.vendor, p.metadata, p.raw_json,
                   o.custom_name, o.custom_vendor, o.price_override
            FROM products p
            LEFT JOIN product_overrides o ON o.product_id = p.id
            WHERE COALESCE(o.hide_from_export, 0) = 0
            ORDER BY p.id
            """
        ).fetchall()
        for row in rows:
            id_, name, sku, section_id, price, stock, vendor, metadata, raw_json, custom_name, custom_vendor, price_override = row
            if section_id in all_excluded:
                continue
            if section_id in sections:
                offer_fields = extract_offer_fields(raw_json)
                pricing = build_export_pricing(price, offer_fields["distributor_discount"], price_override)
                effective = apply_product_overrides(name, pricing["price"], custom_name, vendor, custom_vendor, price_override)
                sections[section_id]["products"].append({
                    "id": id_,
                    "name": effective["name"],
                    "original_name": name,
                    "custom_name": custom_name,
                    "sku": sku,
                    "price": pricing["price"],
                    "original_price": price,
                    "original_price_rub": pricing["source_price_rub"],
                    "calculated_price": pricing["calculated_price"],
                    "price_override": pricing["price_override"],
                    "price_without_vat": pricing["price_without_vat"],
                    "vat_amount": pricing["vat_amount"],
                    "markup_percent": pricing["markup_percent"],
                    "rub_to_byn_rate": pricing["rub_to_byn_rate"],
                    "currency": pricing["currency"],
                    "currency_code": pricing["currency_code"],
                    "pricing_rule": pricing["pricing_rule"],
                    "stock": stock,
                    "vendor": effective["vendor"],
                    "original_vendor": vendor,
                    "custom_vendor": custom_vendor,
                    "name_overridden": effective["name_overridden"],
                    "vendor_overridden": effective["vendor_overridden"],
                    "price_overridden": pricing["price_overridden"],
                    **offer_fields,
                    "metadata": safe_json_loads(metadata, {}),
                })

        tree = []
        for _, sec in sections.items():
            if sec["id"] in all_excluded:
                continue
            if sec["parent"] is None or sec["parent"] in all_excluded:
                tree.append(sec)

        def add_children(parent):
            children = [sec for sec in sections.values() if sec["parent"] == parent["id"]]
            if children:
                parent["children"] = children
                for child in children:
                    add_children(child)

        for root in tree:
            add_children(root)

        with open(EXPORT_DIR / "catalog_tree.json", "w", encoding="utf-8") as f:
            json.dump(tree, f, ensure_ascii=False, indent=2)
        print(f"Exported catalog tree to {EXPORT_DIR / 'catalog_tree.json'}")


def main():
    parser = argparse.ArgumentParser(description="Экспорт SSD каталога для сайта")
    parser.add_argument(
        "--output-dir",
        help="Папка для JSON-файлов (относительно ssd-admin-app или абсолютный путь внутри проекта)",
    )
    args = parser.parse_args()

    export_dir = configure_export_dir(args.output_dir)
    print(f"Starting export for site into {export_dir}...")
    export_sections()
    export_products()
    export_catalog_tree()
    print(f"Export complete. Files in '{export_dir}' directory.")


if __name__ == "__main__":
    main()
