#!/usr/bin/env python3
"""Мини-сайт управления SSD каталогом"""

import json
import sqlite3
import subprocess
import sys
import threading
import time
from pathlib import Path

from flask import Flask, jsonify, redirect, render_template, request, url_for

from catalog_utils import (
    BYN_CURRENCY_SYMBOL,
    RUB_TO_BYN_RATE,
    apply_product_overrides,
    build_export_pricing,
    ensure_product_overrides_table,
    extract_offer_fields,
)

app = Flask(__name__)


@app.template_filter('format_money')
def format_money(value):
    """Показывать BYN-цену без лишних нулей."""
    if value is None:
        return ""
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)

    if abs(amount - round(amount)) < 1e-9:
        return f"{amount:.0f}"
    if abs(amount * 10 - round(amount * 10)) < 1e-9:
        return f"{amount:.1f}"
    return f"{amount:.2f}"


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "ssd_catalog.db"
STATUS_FILE = BASE_DIR / "import_status.json"


def ensure_section_exclude_column(conn):
    c = conn.cursor()
    info = c.execute("PRAGMA table_info(sections)").fetchall()
    columns = [r[1] for r in info]
    if "exclude_from_export" not in columns:
        c.execute("ALTER TABLE sections ADD COLUMN exclude_from_export INTEGER DEFAULT 0")
        conn.commit()


def get_connection():
    """Открыть соединение с БД и гарантировать наличие таблицы правок."""
    conn = sqlite3.connect(DB_PATH)
    ensure_product_overrides_table(conn)
    ensure_section_exclude_column(conn)
    return conn


def get_db_stats():
    """Получить статистику базы данных."""
    if not DB_PATH.exists():
        return {"sections": 0, "products": 0}

    try:
        with get_connection() as conn:
            c = conn.cursor()
            sections = c.execute("SELECT COUNT(*) FROM sections").fetchone()[0]
            products = c.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            return {"sections": sections, "products": products}
    except sqlite3.Error:
        return {"sections": 0, "products": 0}


def get_import_status():
    """Получить статус импорта."""
    if STATUS_FILE.exists():
        try:
            with open(STATUS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"status": "idle", "message": "Готов к импорту", "progress": 0}


def set_import_status(status, message="", progress=0):
    """Установить статус импорта/экспорта."""
    data = {
        "status": status,
        "message": message,
        "progress": progress,
        "timestamp": time.time(),
    }
    with open(STATUS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def run_import(reset=False):
    """Запустить импорт в фоне."""

    def _import():
        try:
            set_import_status("running", "Запуск импорта...", 0)

            cmd = [sys.executable, "ssd_catalog_import.py"]
            if reset:
                cmd.append("--reset")

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=str(BASE_DIR),
            )

            while True:
                output = process.stdout.readline()
                if output == "" and process.poll() is not None:
                    break
                if output:
                    if "Page" in output and "/" in output:
                        try:
                            parts = output.split("/")
                            if len(parts) >= 2:
                                current = int(parts[0].split()[-1])
                                total = int(parts[1].split()[0])
                                progress = int((current / total) * 100)
                                set_import_status("running", f"Импорт: страница {current}/{total}", progress)
                        except Exception:
                            pass
                    elif "Total products imported" in output:
                        set_import_status("running", output.strip(), 100)

            rc = process.poll()
            if rc == 0:
                set_import_status("completed", "Импорт завершен успешно", 100)
            else:
                set_import_status("error", f"Ошибка импорта (код {rc})", 0)

        except Exception as e:
            set_import_status("error", f"Ошибка: {str(e)}", 0)

    thread = threading.Thread(target=_import, daemon=True)
    thread.start()


@app.route('/')
def index():
    """Главная страница."""
    stats = get_db_stats()
    status = get_import_status()
    return render_template('index.html', stats=stats, status=status)


@app.route('/import', methods=['POST'])
def start_import():
    """Запуск импорта."""
    reset = request.form.get('reset') == 'on'
    status = get_import_status()

    if status['status'] == 'running':
        return jsonify({"error": "Импорт уже запущен"}), 400

    run_import(reset)
    return redirect(url_for('index'))


@app.route('/status')
def status_api():
    """API для получения статуса."""
    return jsonify(get_import_status())


@app.route('/sections')
def sections():
    """Страница разделов."""
    if not DB_PATH.exists():
        return render_template('sections.html', sections=[])

    try:
        with get_connection() as conn:
            c = conn.cursor()
            rows = c.execute(
                """
                SELECT id, name, parent, external_id, COALESCE(exclude_from_export, 0) as exclude_from_export,
                       (SELECT COUNT(*) FROM products WHERE section_id = sections.id) as product_count
                FROM sections
                """
            ).fetchall()

            sections_data = []
            for row in rows:
                sections_data.append({
                    "id": row[0],
                    "name": row[1],
                    "parent": row[2],
                    "parent_name": None,
                    "external_id": row[3],
                    "exclude_from_export": bool(row[4]),
                    "product_count": row[5],
                    "children": [],
                })

            by_id = {s['id']: s for s in sections_data}
            roots = []
            for s in sections_data:
                pid = s['parent']
                if pid and pid in by_id:
                    s['parent_name'] = by_id[pid]['name']
                    by_id[pid]['children'].append(s)
                else:
                    roots.append(s)

            def flatten(nodes, level=0):
                out = []
                for n in sorted(nodes, key=lambda x: x['name']):
                    out.append({**n, 'level': level})
                    out.extend(flatten(n['children'], level + 1))
                return out

            sections_data = flatten(roots)

    except Exception:
        sections_data = []

    return render_template('sections.html', sections=sections_data)


@app.route('/sections/set-exclude', methods=['POST'])
def set_section_exclude():
    data = request.get_json(force=True) or {}
    section_id = data.get('id')
    exclude = data.get('exclude')

    if section_id is None:
        return jsonify({'error': 'id required'}), 400
    try:
        section_id = int(section_id)
        exclude = 1 if str(exclude) in ('1', 'true', 'True', 'yes', 'on') else 0
    except (TypeError, ValueError):
        return jsonify({'error': 'invalid data'}), 400

    with get_connection() as conn:
        c = conn.cursor()

        # сохраняем флаг для секции и всех потомков
        rows = c.execute("SELECT id, parent FROM sections").fetchall()
        children = {}
        for sid, parent in rows:
            children.setdefault(parent, []).append(sid)

        exclude_set = {section_id}
        stack = [section_id]
        while stack:
            cur = stack.pop()
            for ch in children.get(cur, []):
                if ch not in exclude_set:
                    exclude_set.add(ch)
                    stack.append(ch)

        q = "UPDATE sections SET exclude_from_export = ? WHERE id = ?"
        c.executemany(q, [(exclude, sid) for sid in exclude_set])
        conn.commit()

    return jsonify({'success': True})


@app.route('/products')
def products():
    """Страница товаров с сохранением пользовательских правок перед экспортом."""
    section_id = request.args.get('section_id', type=int)
    page = request.args.get('page', 1, type=int)
    query_text = (request.args.get('q') or '').strip()
    saved_product = request.args.get('saved', type=int)
    error_code = request.args.get('error')
    per_page = 25

    error_message = {
        'price_format': 'Цена должна быть числом в BYN, например 45.6',
        'missing': 'Товар не найден в базе.',
    }.get(error_code)

    if not DB_PATH.exists():
        return render_template(
            'products.html',
            products=[],
            sections=[],
            pagination={'page': 1, 'total': 0, 'total_pages': 0, 'has_prev': False, 'has_next': False},
            current_section=section_id,
            current_query=query_text,
            saved_product=saved_product,
            error_message=error_message,
            currency_symbol=BYN_CURRENCY_SYMBOL,
            rub_to_byn_rate=float(RUB_TO_BYN_RATE),
        )

    try:
        with get_connection() as conn:
            c = conn.cursor()

            sections = c.execute("SELECT id, name FROM sections ORDER BY name").fetchall()
            sections = [{"id": s[0], "name": s[1]} for s in sections]

            where_clauses = []
            params = []
            if section_id:
                where_clauses.append("p.section_id = ?")
                params.append(section_id)
            if query_text:
                like = f"%{query_text}%"
                where_clauses.append(
                    "(p.name LIKE ? OR COALESCE(o.custom_name, '') LIKE ? OR COALESCE(p.sku, '') LIKE ? OR COALESCE(p.vendor, '') LIKE ? OR COALESCE(o.custom_vendor, '') LIKE ?)"
                )
                params.extend([like, like, like, like, like])

            where_sql = f" WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

            count_query = f"""
                SELECT COUNT(*)
                FROM products p
                LEFT JOIN product_overrides o ON o.product_id = p.id
                {where_sql}
            """
            total = c.execute(count_query, params).fetchone()[0]
            total_pages = (total + per_page - 1) // per_page if total else 0
            if total_pages and page > total_pages:
                page = total_pages

            query = f"""
                SELECT p.id, p.name, p.sku, p.price, p.stock, p.vendor, s.name as section_name,
                      p.raw_json, o.custom_name, o.custom_vendor, o.price_override,
                      COALESCE(o.hide_from_export, 0) as hide_from_export, o.updated_at
                FROM products p
                LEFT JOIN sections s ON p.section_id = s.id
                LEFT JOIN product_overrides o ON o.product_id = p.id
                {where_sql}
                ORDER BY p.id
                LIMIT ? OFFSET ?
            """
            rows = c.execute(query, [*params, per_page, (page - 1) * per_page]).fetchall()

            products_data = []
            for row in rows:
                offer_fields = extract_offer_fields(row[7])
                pricing = build_export_pricing(row[3], offer_fields['distributor_discount'], row[10])
                effective = apply_product_overrides(row[1], pricing['price'], row[8], row[5], row[9], row[10])
                products_data.append({
                    'id': row[0],
                    'name': effective['name'],
                    'original_name': row[1],
                    'custom_name': row[8],
                    'sku': row[2],
                    'price': pricing['price'],
                    'original_price': row[3],
                    'original_price_rub': pricing['source_price_rub'],
                    'calculated_price': pricing['calculated_price'],
                    'price_override': pricing['price_override'],
                    'price_without_vat': pricing['price_without_vat'],
                    'vat_amount': pricing['vat_amount'],
                    'markup_percent': pricing['markup_percent'],
                    'currency': pricing['currency'],
                    'currency_code': pricing['currency_code'],
                    'rub_to_byn_rate': pricing['rub_to_byn_rate'],
                    'pricing_rule': pricing['pricing_rule'],
                    'stock': row[4],
                    'vendor': effective['vendor'],
                    'original_vendor': row[5],
                    'custom_vendor': row[9],
                    'section_name': row[6],
                    'hide_from_export': bool(row[11]),
                    'updated_at': row[12],
                    'name_overridden': effective['name_overridden'],
                    'vendor_overridden': effective['vendor_overridden'],
                    'price_overridden': pricing['price_overridden'],
                    **offer_fields,
                })

            pagination = {
                'page': page,
                'total': total,
                'total_pages': total_pages,
                'has_prev': page > 1,
                'has_next': page < total_pages,
                'prev_page': page - 1 if page > 1 else None,
                'next_page': page + 1 if page < total_pages else None,
            }

    except Exception:
        products_data = []
        sections = []
        pagination = {'page': 1, 'total': 0, 'total_pages': 0, 'has_prev': False, 'has_next': False}

    return render_template(
        'products.html',
        products=products_data,
        sections=sections,
        pagination=pagination,
        current_section=section_id,
        current_query=query_text,
        saved_product=saved_product,
        error_message=error_message,
        currency_symbol=BYN_CURRENCY_SYMBOL,
        rub_to_byn_rate=float(RUB_TO_BYN_RATE),
    )


@app.route('/products/<int:product_id>/edit', methods=['POST'])
def save_product_override(product_id):
    """Сохранить пользовательские правки названия, производителя и/или цены."""
    section_id = request.form.get('section_id')
    page = request.form.get('page', '1')
    query_text = (request.form.get('q') or '').strip()
    custom_name = (request.form.get('custom_name') or '').strip() or None
    custom_vendor = (request.form.get('custom_vendor') or '').strip() or None
    price_override_raw = (request.form.get('price_override') or '').strip()
    hide_from_export = 1 if request.form.get('hide_from_export') == '1' else 0
    price_override = None
    error_code = None

    if price_override_raw:
        try:
            price_override = float(price_override_raw.replace(',', '.'))
        except ValueError:
            error_code = 'price_format'

    if DB_PATH.exists() and error_code is None:
        with get_connection() as conn:
            c = conn.cursor()
            row = c.execute(
                "SELECT id, sku, name, vendor, price, raw_json FROM products WHERE id = ?",
                (product_id,),
            ).fetchone()

            if not row:
                error_code = 'missing'
            else:
                if custom_name == row[2]:
                    custom_name = None
                if custom_vendor == row[3]:
                    custom_vendor = None

                offer_fields = extract_offer_fields(row[5])
                pricing = build_export_pricing(row[4], offer_fields['distributor_discount'], None)
                calculated_price = pricing['calculated_price']
                if price_override is not None and calculated_price is not None and abs(price_override - calculated_price) < 1e-9:
                    price_override = None

                if custom_name is None and custom_vendor is None and price_override is None and not hide_from_export:
                    c.execute("DELETE FROM product_overrides WHERE product_id = ?", (product_id,))
                else:
                    c.execute(
                        """
                        INSERT INTO product_overrides (product_id, sku, custom_name, custom_vendor, price_override, hide_from_export, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(product_id) DO UPDATE SET
                            sku = excluded.sku,
                            custom_name = excluded.custom_name,
                            custom_vendor = excluded.custom_vendor,
                            price_override = excluded.price_override,
                            hide_from_export = excluded.hide_from_export,
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (product_id, row[1], custom_name, custom_vendor, price_override, hide_from_export),
                    )
                conn.commit()

    route_params = {'page': page}
    if section_id:
        route_params['section_id'] = section_id
    if query_text:
        route_params['q'] = query_text
    if error_code:
        route_params['error'] = error_code
    else:
        route_params['saved'] = product_id

    return redirect(url_for('products', **route_params))


@app.route('/export')
def export():
    """Страница экспорта."""
    stats = get_db_stats()
    return render_template('export.html', stats=stats)


@app.route('/run_export', methods=['POST'])
def run_export():
    """Запуск экспорта."""
    export_type = request.form.get('type')

    def _export():
        try:
            set_import_status("running", f"Экспорт {export_type}...", 0)
            if export_type == 'json':
                cmd = [sys.executable, 'export_for_site.py']
            elif export_type == 'csv':
                cmd = [sys.executable, 'export_csv.py']
            elif export_type == 'images':
                cmd = [sys.executable, 'download_images.py']
            else:
                raise ValueError(f"Неизвестный тип экспорта: {export_type}")

            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                cwd=str(BASE_DIR),
            )

            for raw_line in iter(process.stdout.readline, ""):
                line = raw_line.strip()
                if not line:
                    continue

                # Reduce noise from image export: only keep meaningful progress/summary lines.
                if export_type == 'images':
                    if line.startswith("Progress:") or line.startswith("Image download complete"):
                        set_import_status("running", line, 0)
                    elif line.startswith("Total images:") or line.startswith("Downloaded:") or line.startswith("Already existing:") or line.startswith("Failed:"):
                        set_import_status("running", line, 0)
                else:
                    set_import_status("running", line, 0)

            rc = process.wait()
            if rc != 0:
                raise RuntimeError(f"Код выхода: {rc}")

            set_import_status("completed", f"Экспорт {export_type} завершен", 100)
        except Exception as e:
            set_import_status("error", f"Ошибка экспорта: {str(e)}", 0)

    thread = threading.Thread(target=_export, daemon=True)
    thread.start()

    return redirect(url_for('export'))


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False, host='0.0.0.0', port=5000)
