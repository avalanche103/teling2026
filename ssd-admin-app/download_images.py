#!/usr/bin/env python3
"""Скачивание изображений товаров SSD"""

import json
import os
import requests
import time
import re
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
EXPORT_DIR = BASE_DIR / "export"
IMAGES_DIR = PROJECT_ROOT / "public" / "images"
IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_filename_part(value):
    """Make a string safe for use in filenames."""
    text = str(value or "").strip()
    if not text:
        return "unknown"
    # Replace characters that are invalid in filenames on Windows.
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


def build_image_filename(product, pic_url, image_index):
    """Build image filename as <sku_or_article>_<index>.<ext>."""
    raw_json = product.get("raw_json", {})
    article = product.get("sku") or raw_json.get("article") or product.get("id")
    article_safe = sanitize_filename_part(article)
    ext = get_extension_from_url(pic_url)
    return f"{article_safe}_{image_index}{ext}"

def download_image(url, filename):
    """Download image to project public/images directory."""
    try:
        r = requests.get(url, timeout=10)
        r.raise_for_status()
        with open(IMAGES_DIR / filename, "wb") as f:
            f.write(r.content)
        return True
    except Exception as e:
        print(f"Failed to download {url}: {e}")
        return False

def process_products():
    """Process products.json and download images"""
    products_file = EXPORT_DIR / "products.json"
    if not products_file.exists():
        print("products.json not found, run export_for_site.py first")
        return

    with open(products_file, encoding="utf-8") as f:
        products = json.load(f)

    total_images = 0
    downloaded = 0
    skipped = 0
    failed = 0
    progress_interval = 50

    for product_idx, product in enumerate(products):
        raw_json = product.get("raw_json", {})
        pictures = raw_json.get("pictures", [])

        for image_index, pic_url in enumerate(pictures, start=1):
            if not pic_url:
                continue
            total_images += 1

            filename = build_image_filename(product, pic_url, image_index)

            filepath = IMAGES_DIR / filename
            if filepath.exists():
                skipped += 1
            else:
                if download_image(pic_url, filename):
                    downloaded += 1
                else:
                    failed += 1

                time.sleep(0.1)  # Be nice to server

            # Show progress every N items
            if total_images % progress_interval == 0:
                print(f"Progress: {total_images} images processed ({downloaded} new, {skipped} existing)")

    print("\n" + "="*60)
    print("Image download complete:")
    print(f"  Total images:    {total_images}")
    print(f"  Downloaded:      {downloaded}")
    print(f"  Already existing: {skipped}")
    print(f"  Failed:          {failed}")
    print(f"  Location:        {IMAGES_DIR}")
    print("="*60)

if __name__ == "__main__":
    process_products()
