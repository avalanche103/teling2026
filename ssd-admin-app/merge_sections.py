#!/usr/bin/env python3
"""Safe merge of SSD sections into site data/sections.json.

SSD export must never wipe Microinform / local-only sections.
Local metadata.selected_filters is preserved when SSD upserts an existing id.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

from catalog_utils import (
    DB_PATH,
    PROJECT_ROOT,
    apply_section_overrides,
    read_section_overrides,
    safe_json_loads,
)

SITE_SECTIONS_PATH = PROJECT_ROOT / "data" / "sections.json"

# Microinform-created leaf ids (see lib/microinform/section-hints.ts).
# SSD shared leaves 517/518/508/519/520 are intentionally NOT in this set.
MICROINFORM_OWNED_IDS = frozenset(
    list(range(632, 645))  # active network / software
    + list(range(653, 665))  # ATEN KVM parent + A/V tree
    + list(range(665, 669))  # UPS accessories under #292
)


def load_json_list(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError(f"Expected JSON array in {path}")
    return [item for item in data if isinstance(item, dict)]


def write_json_list(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2)
        f.write("\n")


def get_excluded_section_ids(conn: sqlite3.Connection) -> set[int]:
    rows = conn.execute(
        "SELECT id, parent, COALESCE(exclude_from_export, 0) FROM sections"
    ).fetchall()
    children: dict[Any, list[int]] = {}
    for sid, parent, _ex in rows:
        children.setdefault(parent, []).append(sid)

    excluded = {sid for sid, _parent, ex in rows if ex}
    stack = list(excluded)
    while stack:
        cur = stack.pop()
        for ch in children.get(cur, []):
            if ch not in excluded:
                excluded.add(ch)
                stack.append(ch)
    return excluded


def load_ssd_sections_from_db(db_path: Path = DB_PATH) -> tuple[list[dict[str, Any]], set[int]]:
    with sqlite3.connect(db_path) as conn:
        excluded = get_excluded_section_ids(conn)
        rows = conn.execute(
            "SELECT id, name, parent, external_id, metadata FROM sections ORDER BY id"
        ).fetchall()

    sections: list[dict[str, Any]] = []
    ssd_ids: set[int] = set()
    for id_, name, parent, external_id, metadata in rows:
        ssd_ids.add(id_)
        if id_ in excluded:
            continue
        sections.append(
            {
                "id": id_,
                "name": name,
                "parent": parent,
                "external_id": external_id,
                "metadata": safe_json_loads(metadata, {}),
            }
        )
    return sections, ssd_ids


def merge_metadata(
    existing_meta: dict[str, Any] | None,
    incoming_meta: dict[str, Any] | None,
) -> dict[str, Any]:
    merged = dict(incoming_meta or {})
    local = existing_meta or {}
    local_filters = local.get("selected_filters")
    if local_filters and not merged.get("selected_filters"):
        merged["selected_filters"] = local_filters
    return merged


def merge_ssd_into_site_sections(
    site_sections: list[dict[str, Any]],
    ssd_sections: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Upsert SSD sections; keep local-only; never overwrite Microinform-owned ids."""
    by_id: dict[int, dict[str, Any]] = {}
    for section in site_sections:
        sid = section.get("id")
        if isinstance(sid, int):
            by_id[sid] = section

    added: list[int] = []
    updated: list[int] = []
    skipped_conflicts: list[int] = []
    preserved_filters: list[int] = []

    for ssd in ssd_sections:
        sid = ssd.get("id")
        if not isinstance(sid, int):
            continue

        existing = by_id.get(sid)
        if existing is not None and sid in MICROINFORM_OWNED_IDS:
            # SSD must not reclaim Microinform leaf ids.
            skipped_conflicts.append(sid)
            continue

        incoming_meta = ssd.get("metadata") if isinstance(ssd.get("metadata"), dict) else {}
        incoming = {
            "id": sid,
            "name": ssd.get("name"),
            "parent": ssd.get("parent"),
            "external_id": ssd.get("external_id"),
            "metadata": merge_metadata(
                existing.get("metadata") if existing else None,
                incoming_meta,
            ),
        }

        if existing is None:
            by_id[sid] = incoming
            added.append(sid)
            continue

        before_filters = (existing.get("metadata") or {}).get("selected_filters")
        if before_filters and not incoming_meta.get("selected_filters"):
            preserved_filters.append(sid)

        by_id[sid] = incoming
        updated.append(sid)

    overrides = read_section_overrides()
    merged = apply_section_overrides([by_id[k] for k in sorted(by_id)], overrides)
    by_id = {s["id"]: s for s in merged if isinstance(s.get("id"), int)}
    ssd_id_set = {s["id"] for s in ssd_sections if isinstance(s.get("id"), int)}
    local_only = [sid for sid in by_id if sid not in ssd_id_set]
    stats = {
        "site_before": len(site_sections),
        "site_after": len(merged),
        "ssd_exported": len(ssd_sections),
        "added": added,
        "updated_count": len(updated),
        "skipped_conflicts": skipped_conflicts,
        "preserved_filters_count": len(preserved_filters),
        "local_only": local_only,
        "overrides_applied": sorted(sid for sid in overrides if sid in by_id),
    }
    return merged, stats


def apply_ssd_sections_to_site(
    site_path: Path = SITE_SECTIONS_PATH,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    site_sections = load_json_list(site_path)
    ssd_sections, _ssd_ids = load_ssd_sections_from_db(db_path)
    merged, stats = merge_ssd_into_site_sections(site_sections, ssd_sections)
    write_json_list(site_path, merged)
    stats["path"] = str(site_path)
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Merge SSD sections into data/sections.json without wiping Microinform"
    )
    parser.add_argument(
        "--site-sections",
        type=Path,
        default=SITE_SECTIONS_PATH,
        help="Path to site sections.json",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DB_PATH,
        help="Path to ssd_catalog.db",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print stats without writing",
    )
    args = parser.parse_args()

    site_sections = load_json_list(args.site_sections)
    ssd_sections, _ = load_ssd_sections_from_db(args.db)
    merged, stats = merge_ssd_into_site_sections(site_sections, ssd_sections)

    print(json.dumps(stats, ensure_ascii=False, indent=2))
    if stats["skipped_conflicts"]:
        print(
            "ERROR: SSD claimed Microinform-owned section ids:",
            stats["skipped_conflicts"],
            file=sys.stderr,
        )
        return 2

    if args.dry_run:
        print("Dry run — not writing.")
        return 0

    write_json_list(args.site_sections, merged)
    print(f"Wrote {len(merged)} sections to {args.site_sections}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
