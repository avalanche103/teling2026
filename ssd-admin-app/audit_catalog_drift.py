#!/usr/bin/env python3
"""Audit SSD DB vs site sections/products for catalog drift."""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from catalog_utils import DB_PATH, PROJECT_ROOT
from merge_sections import MICROINFORM_OWNED_IDS

SITE_SECTIONS = PROJECT_ROOT / "data" / "sections.json"
SITE_PRODUCTS = PROJECT_ROOT / "data" / "products.json"
MI_PRODUCTS = PROJECT_ROOT / "data" / "products.microinform.json"


def load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    raw = path.read_text(encoding="utf-8").strip()
    if not raw or raw.startswith("version https://git-lfs.github.com/spec/v1"):
        return []
    data = json.loads(raw)
    return data if isinstance(data, list) else []


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit SSD/site section drift")
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--sections", type=Path, default=SITE_SECTIONS)
    parser.add_argument("--products", type=Path, default=SITE_PRODUCTS)
    parser.add_argument("--mi-products", type=Path, default=MI_PRODUCTS)
    args = parser.parse_args()

    sections = load_json_list(args.sections)
    site_ids = {s["id"] for s in sections if isinstance(s.get("id"), int)}

    with sqlite3.connect(args.db) as conn:
        db_rows = conn.execute("SELECT id, name, parent FROM sections ORDER BY id").fetchall()
    db_ids = {row[0] for row in db_rows}
    db_names = {row[0]: row[1] for row in db_rows}

    missing_in_site = sorted(db_ids - site_ids)
    local_only = sorted(site_ids - db_ids)
    mi_owned_present = sorted(sid for sid in MICROINFORM_OWNED_IDS if sid in site_ids)
    mi_owned_missing = sorted(sid for sid in MICROINFORM_OWNED_IDS if sid not in site_ids)
    id_collisions = sorted(db_ids & MICROINFORM_OWNED_IDS)

    products = load_json_list(args.products)
    mi_products = load_json_list(args.mi_products)

    ssd_orphans = Counter(
        p.get("section_id") for p in products if p.get("section_id") not in site_ids
    )
    mi_orphans = Counter(
        p.get("section_id") for p in mi_products if p.get("section_id") not in site_ids
    )

    report = {
        "db_sections": len(db_ids),
        "site_sections": len(site_ids),
        "missing_in_site": [
            {"id": sid, "name": db_names.get(sid)} for sid in missing_in_site
        ],
        "local_only_ids": local_only,
        "microinform_owned_present": mi_owned_present,
        "microinform_owned_missing": mi_owned_missing,
        "ssd_vs_microinform_id_collisions": id_collisions,
        "ssd_orphan_section_ids": {
            str(k): v for k, v in ssd_orphans.most_common()
        },
        "ssd_orphan_products": sum(ssd_orphans.values()),
        "microinform_orphan_section_ids": {
            str(k): v for k, v in mi_orphans.most_common()
        },
        "microinform_orphan_products": sum(mi_orphans.values()),
        "cable_section_279_children": [
            s["id"] for s in sections if s.get("parent") == 279
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))

    # Orphans whose section_id exists in SSD DB mean sections.json is stale.
    actionable_ssd_orphans = {
        k: v for k, v in ssd_orphans.items() if k is not None and k in db_ids
    }
    # Products pointing at unknown/null ids are data-quality warnings, not tree drift.
    other_ssd_orphans = {
        k: v for k, v in ssd_orphans.items() if k not in actionable_ssd_orphans
    }

    errors: list[str] = []
    warnings: list[str] = []
    if missing_in_site:
        errors.append(f"missing SSD sections in site: {missing_in_site}")
    if mi_owned_missing:
        errors.append(f"missing Microinform sections: {mi_owned_missing}")
    if id_collisions:
        errors.append(f"SSD DB claims Microinform-owned ids: {id_collisions}")
    if actionable_ssd_orphans:
        errors.append(
            f"SSD products orphaned by missing exported sections: {dict(actionable_ssd_orphans)}"
        )
    if mi_orphans:
        errors.append(f"Microinform orphan products by section_id: {dict(mi_orphans)}")
    if other_ssd_orphans:
        warnings.append(
            f"SSD products with null/unknown section_id (not in DB): {dict(other_ssd_orphans)}"
        )

    if warnings:
        print("WARNINGS:", file=sys.stderr)
        for warn in warnings:
            print(f"  - {warn}", file=sys.stderr)

    if errors:
        print("DRIFT DETECTED:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print("OK: no catalog section drift.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
