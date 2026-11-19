#!/usr/bin/env python3
"""Скачивание изображений товаров SSD в public/images/<SKU>_<n>.<ext>.

После импорта/экспорта каталога: local-first на сайте подхватит эти файлы,
не переписывая URL в JSON (ssd.ru остаётся fallback).

Usage:
  python download_images.py
  python download_images.py --limit 20
  python download_images.py --from-site
  python download_images.py --limit 50 --sku 130411-01171
  python download_images.py --workers 16
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
EXPORT_DIR = BASE_DIR / "export"
SITE_PRODUCTS = PROJECT_ROOT / "data" / "products.json"
IMAGES_DIR = PROJECT_ROOT / "public" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename_part(value):
    """Make a string safe for use in filenames."""
    text = str(value or "").strip()
    if not text:
        return "unknown"
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", text)
    text = re.sub(r"\s+", "_", text)
    return text.strip("._") or "unknown"


def get_extension_from_url(url):
    """Get file extension from URL path, fallback to .webp."""
    parsed = urlparse(url)
    filename = os.path.basename(parsed.path)
    _, ext = os.path.splitext(filename)
    if ext and len(ext) <= 10:
        return ext.lower()
    return ".webp"


def product_sku(product):
    raw_json = product.get("raw_json") or {}
    metadata = product.get("metadata") or {}
    return (
        product.get("sku")
        or raw_json.get("article")
        or metadata.get("article")
        or product.get("id")
    )


def product_pictures(product):
    raw_json = product.get("raw_json") or {}
    metadata = product.get("metadata") or {}
    pictures = raw_json.get("pictures") or metadata.get("pictures") or []
    return [url for url in pictures if isinstance(url, str) and url.strip()]


def build_image_filename(product, pic_url, image_index):
    """Build image filename as <sku_or_article>_<index>.<ext>."""
    article_safe = sanitize_filename_part(product_sku(product))
    ext = get_extension_from_url(pic_url)
    return f"{article_safe}_{image_index}{ext}"


def download_image(session: requests.Session, url: str, filename: str, retries: int = 3) -> bool:
    """Download image to project public/images directory."""
    filepath = IMAGES_DIR / filename
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            # (connect timeout, read timeout) — ssd.ru rate-limits aggressive parallel pulls
            r = session.get(url, timeout=(15, 60))
            r.raise_for_status()
            if not r.content:
                raise ValueError("empty body")
            tmp = filepath.with_suffix(filepath.suffix + ".part")
            with open(tmp, "wb") as f:
                f.write(r.content)
            tmp.replace(filepath)
            return True
        except Exception as e:
            last_error = e
            time.sleep(0.4 * attempt)
    print(f"Failed to download {url}: {last_error}", flush=True)
    return False


def load_products(from_site: bool):
    products_file = SITE_PRODUCTS if from_site else EXPORT_DIR / "products.json"
    if not products_file.exists():
        hint = "check data/products.json" if from_site else "run export_for_site.py first"
        raise FileNotFoundError(f"{products_file} not found, {hint}")
    with open(products_file, encoding="utf-8") as f:
        products = json.load(f)
    if not isinstance(products, list):
        raise ValueError(f"Expected a list in {products_file}")
    return products_file, products


def collect_jobs(products, first_only=False):
    jobs = []
    total_known = 0
    for product in products:
        pictures = product_pictures(product)
        if first_only and pictures:
            pictures = pictures[:1]
        for image_index, pic_url in enumerate(pictures, start=1):
            total_known += 1
            filename = build_image_filename(product, pic_url, image_index)
            filepath = IMAGES_DIR / filename
            if filepath.exists() and filepath.stat().st_size > 0:
                continue
            jobs.append((pic_url, filename))
    return total_known, jobs


def process_products(limit=None, sku_filter=None, from_site=False, workers=12, first_only=False):
    """Process products.json and download images."""
    products_file, products = load_products(from_site)
    print(f"Source: {products_file} ({len(products)} products)", flush=True)

    if sku_filter:
        wanted = {s.strip() for s in sku_filter if s and s.strip()}
        products = [p for p in products if str(product_sku(p) or "").strip() in wanted]
        print(f"SKU filter: {len(products)} product(s)", flush=True)

    if limit is not None and limit >= 0:
        selected = []
        for product in products:
            if product_pictures(product):
                selected.append(product)
            if len(selected) >= limit:
                break
        products = selected
        print(f"Limit: {len(products)} product(s) with pictures", flush=True)

    if first_only:
        print("Mode: first image only (_1.*) for thumbnails / cards", flush=True)

    total_known, jobs = collect_jobs(products, first_only=first_only)
    skipped = total_known - len(jobs)
    print(
        f"Images: {total_known} total, {skipped} already present, {len(jobs)} to download "
        f"(workers={workers})",
        flush=True,
    )

    downloaded = 0
    failed = 0
    if jobs:
        session_local = requests.Session()
        session_local.headers.update(
            {
                "User-Agent": "TelingImageSync/1.0 (+https://teling.by)",
                "Accept": "image/*,*/*;q=0.8",
            }
        )

        def worker(job):
            url, filename = job
            # One Session per worker is safer under threads.
            with requests.Session() as session:
                session.headers.update(session_local.headers)
                ok = download_image(session, url, filename)
            return ok, filename

        done = 0
        with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
            futures = [pool.submit(worker, job) for job in jobs]
            for future in as_completed(futures):
                ok, _filename = future.result()
                done += 1
                if ok:
                    downloaded += 1
                else:
                    failed += 1
                if done % 50 == 0 or done == len(jobs):
                    print(
                        f"Progress: {done}/{len(jobs)} downloads "
                        f"({downloaded} ok, {failed} failed)",
                        flush=True,
                    )

    print("\n" + "=" * 60, flush=True)
    print("Image download complete:", flush=True)
    print(f"  Total images:     {total_known}", flush=True)
    print(f"  Downloaded:       {downloaded}", flush=True)
    print(f"  Already existing: {skipped}", flush=True)
    print(f"  Failed:           {failed}", flush=True)
    print(f"  Location:         {IMAGES_DIR}", flush=True)
    print("=" * 60, flush=True)
    return {
        "total": total_known,
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
    }


def parse_args():
    parser = argparse.ArgumentParser(description="Download SSD product images into public/images")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Download images for at most N products that have pictures (smoke mode)",
    )
    parser.add_argument(
        "--sku",
        action="append",
        default=None,
        help="Only these SKUs (repeatable). Example: --sku 130411-01171",
    )
    parser.add_argument(
        "--from-site",
        action="store_true",
        help="Read data/products.json instead of ssd-admin-app/export/products.json",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=12,
        help="Parallel download workers (default: 12)",
    )
    parser.add_argument(
        "--first-only",
        action="store_true",
        help="Download only the first picture per product (_1.*) for cards / «Вы смотрели»",
    )
    return parser.parse_args()


if __name__ == "__main__":
    # Avoid delayed logs when piping/redirecting on Windows.
    try:
        sys.stdout.reconfigure(line_buffering=True)
    except Exception:
        pass
    args = parse_args()
    process_products(
        limit=args.limit,
        sku_filter=args.sku,
        from_site=args.from_site,
        workers=args.workers,
        first_only=args.first_only,
    )
