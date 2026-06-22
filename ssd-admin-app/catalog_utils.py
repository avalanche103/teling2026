#!/usr/bin/env python3
"""Общие утилиты для SSD каталога, пользовательских правок и ценообразования экспорта."""

from __future__ import annotations

import json
import os
import sqlite3
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_HALF_UP
from pathlib import Path
from typing import Any

PRODUCT_OVERRIDES_SCHEMA = """
CREATE TABLE IF NOT EXISTS product_overrides (
    product_id INTEGER PRIMARY KEY,
    sku TEXT,
    custom_name TEXT,
    custom_vendor TEXT,
    price_override REAL,
    hide_from_export INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
)
"""

PRODUCT_OVERRIDES_INDEX = """
CREATE INDEX IF NOT EXISTS idx_product_overrides_sku
ON product_overrides(sku)
"""

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DB_PATH = BASE_DIR / "ssd_catalog.db"
SETTINGS_PATH = BASE_DIR / "settings.json"
DEFAULT_EXPORT_DIR = BASE_DIR / "export"
DEFAULT_RUB_TO_BYN_RATE = Decimal("0.036")
VAT_RATE = Decimal("0.20")
BYN_CURRENCY_SYMBOL = "Br"
BYN_CURRENCY_CODE = "BYN"


def get_default_rub_to_byn_rate() -> Decimal:
    """Вернуть курс по умолчанию: из env или константа."""
    env_rate = to_decimal(os.getenv("RUB_TO_BYN_RATE"))
    if env_rate is not None and env_rate > 0:
        return env_rate
    return DEFAULT_RUB_TO_BYN_RATE


def read_settings() -> dict[str, Any]:
    """Прочитать настройки SSD-приложения из JSON."""
    if not SETTINGS_PATH.exists():
        return {}
    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as file:
            data = json.load(file)
    except (OSError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def write_settings(settings: dict[str, Any]) -> None:
    """Сохранить настройки SSD-приложения в JSON."""
    SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as file:
        json.dump(settings, file, ensure_ascii=False, indent=2)


def resolve_export_dir(raw_path: str) -> Path:
    """Разрешить и проверить папку для экспорта внутри проекта сайта."""
    cleaned = raw_path.strip()
    if not cleaned:
        cleaned = "export"

    candidate = Path(cleaned)
    if not candidate.is_absolute():
        candidate = (BASE_DIR / candidate).resolve()
    else:
        candidate = candidate.resolve()

    project_root = PROJECT_ROOT.resolve()
    try:
        candidate.relative_to(project_root)
    except ValueError as exc:
        raise ValueError("Папка должна находиться внутри проекта сайта") from exc

    candidate.mkdir(parents=True, exist_ok=True)
    return candidate


def get_last_export_dir() -> Path:
    """Вернуть последнюю папку экспорта или значение по умолчанию."""
    stored = read_settings().get("last_export_dir")
    if isinstance(stored, str) and stored.strip():
        try:
            return resolve_export_dir(stored)
        except ValueError:
            pass
    DEFAULT_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    return DEFAULT_EXPORT_DIR


def set_last_export_dir(path: Path) -> None:
    """Сохранить последнюю папку экспорта."""
    settings = read_settings()
    settings["last_export_dir"] = str(path)
    write_settings(settings)


def export_dir_for_form() -> str:
    """Показать путь экспорта в форме: относительный к ssd-admin-app, если возможно."""
    path = get_last_export_dir()
    try:
        return path.relative_to(BASE_DIR).as_posix()
    except ValueError:
        return str(path)


def get_rub_to_byn_rate() -> Decimal:
    """Получить текущий курс RUB → BYN из JSON или значение по умолчанию."""
    stored_rate = to_decimal(read_settings().get("rub_to_byn_rate"))
    if stored_rate is not None and stored_rate > 0:
        return stored_rate
    return get_default_rub_to_byn_rate()


def set_rub_to_byn_rate(rate: Decimal) -> None:
    """Сохранить курс RUB → BYN в JSON."""
    settings = read_settings()
    settings["rub_to_byn_rate"] = float(rate)
    write_settings(settings)


def parse_rub_to_byn_rate_input(value: str | None) -> Decimal | None:
    """Разобрать и проверить введенный пользователем курс."""
    rate = to_decimal(value)
    if rate is None or rate <= 0 or rate > Decimal("1"):
        return None
    return rate


def ensure_product_overrides_table(conn: sqlite3.Connection) -> None:
    """Создать таблицу пользовательских правок и добавить новые колонки при миграции."""
    conn.execute(PRODUCT_OVERRIDES_SCHEMA)
    conn.execute(PRODUCT_OVERRIDES_INDEX)

    columns = {row[1] for row in conn.execute("PRAGMA table_info(product_overrides)").fetchall()}
    if "hide_from_export" not in columns:
        conn.execute("ALTER TABLE product_overrides ADD COLUMN hide_from_export INTEGER DEFAULT 0")
    if "custom_vendor" not in columns:
        conn.execute("ALTER TABLE product_overrides ADD COLUMN custom_vendor TEXT")

    conn.commit()


def safe_json_loads(value: str | None, default: Any):
    """Безопасно разобрать JSON и вернуть default при ошибке."""
    if not value:
        return default
    try:
        return json.loads(value)
    except (TypeError, json.JSONDecodeError):
        return default


def to_float(value: Any) -> float | None:
    """Преобразовать значение к float, если это возможно."""
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def to_decimal(value: Any) -> Decimal | None:
    """Преобразовать значение к Decimal для точных денежных вычислений."""
    if value in (None, ""):
        return None
    try:
        normalized = str(value).replace(",", ".").strip()
        return Decimal(normalized)
    except (InvalidOperation, ValueError, TypeError):
        return None


def decimal_to_float(value: Decimal | None) -> float | None:
    """Преобразовать Decimal к float для JSON/SQLite вывода."""
    if value is None:
        return None
    return float(value)


def normalize_display_price(value: float | Decimal | None) -> float | None:
    """Считать нулевые и отрицательные цены отсутствующими."""
    numeric = to_float(value)
    if numeric is None or numeric <= 0:
        return None
    return numeric


def extract_offer_fields(raw_json_text: str | None) -> dict[str, float | None]:
    """Извлечь скидки и связанные ценовые поля из SSD offer."""
    raw = safe_json_loads(raw_json_text, {})
    offer = raw.get("offer") if isinstance(raw, dict) else {}
    if not isinstance(offer, dict):
        offer = {}

    return {
        "distributor_discount": to_float(offer.get("discount")),
        "opt_discount": to_float(offer.get("optDiscount")),
        "opt_price": to_float(offer.get("optPrice")),
        "retail_price": to_float(offer.get("priceRealize")),
        "min_price_realize": to_float(offer.get("minPriceRealize")),
        "price_without_nds": to_float(offer.get("priceWithoutNds")),
        "nds": to_float(offer.get("nds")),
    }


def get_markup_percent(distributor_discount: float | None) -> int:
    """Определить наценку в зависимости от скидки дистрибутора."""
    discount = to_float(distributor_discount)
    if discount is not None and discount >= 25:
        return 50
    if discount is not None and discount > 5:
        return 30
    return 20


def round_price_for_vat(price_byn: Decimal) -> Decimal:
    """Округлить цену так, чтобы НДС 20% и цена без НДС были удобными для Беларуси."""
    if price_byn <= Decimal("0"):
        return Decimal("0.0")

    step = Decimal("6") if price_byn >= Decimal("20") else Decimal("0.6")
    rounded = (price_byn / step).to_integral_value(rounding=ROUND_CEILING) * step
    quant = Decimal("1") if rounded >= Decimal("20") else Decimal("0.1")
    return rounded.quantize(quant, rounding=ROUND_HALF_UP)


def split_vat(price_byn: Decimal | None) -> tuple[Decimal | None, Decimal | None]:
    """Разделить итоговую цену на стоимость без НДС и сумму НДС."""
    if price_byn is None:
        return None, None

    quant = Decimal("1") if price_byn >= Decimal("20") else Decimal("0.1")
    price_without_vat = (price_byn / (Decimal("1") + VAT_RATE)).quantize(quant, rounding=ROUND_HALF_UP)
    vat_amount = (price_byn - price_without_vat).quantize(quant, rounding=ROUND_HALF_UP)
    return price_without_vat, vat_amount


def build_export_pricing(
    source_price_rub: float | None,
    distributor_discount: float | None,
    price_override: float | None = None,
    rub_to_byn_rate: Decimal | None = None,
) -> dict[str, Any]:
    """Рассчитать экспортную цену в BYN по бизнес-правилам пользователя."""
    source_price = to_decimal(source_price_rub)
    override_price = to_decimal(price_override)
    rate = rub_to_byn_rate if rub_to_byn_rate is not None else get_rub_to_byn_rate()
    markup_percent = get_markup_percent(distributor_discount)
    markup_multiplier = (Decimal("100") + Decimal(str(markup_percent))) / Decimal("100")

    calculated_price = None
    if source_price is not None:
        calculated_raw = source_price * markup_multiplier * rate
        calculated_price = round_price_for_vat(calculated_raw)

    effective_price = override_price if override_price is not None else calculated_price
    effective_price_for_output = normalize_display_price(effective_price)
    calculated_price_for_output = normalize_display_price(calculated_price)
    price_without_vat, vat_amount = split_vat(effective_price if effective_price_for_output is not None else None)

    if effective_price_for_output is None or effective_price is None:
        rounding_step = None
    else:
        rounding_step = decimal_to_float(Decimal("1") if effective_price >= Decimal("20") else Decimal("0.1"))

    return {
        "price": effective_price_for_output,
        "calculated_price": calculated_price_for_output,
        "source_price_rub": normalize_display_price(source_price),
        "price_override": normalize_display_price(override_price),
        "price_without_vat": normalize_display_price(price_without_vat),
        "vat_amount": normalize_display_price(vat_amount),
        "markup_percent": markup_percent,
        "rub_to_byn_rate": decimal_to_float(rate),
        "currency": BYN_CURRENCY_SYMBOL,
        "currency_code": BYN_CURRENCY_CODE,
        "price_overridden": override_price is not None,
        "rounding_step": rounding_step,
        "pricing_rule": f"discount={to_float(distributor_discount) if distributor_discount is not None else 'n/a'}% -> +{markup_percent}% -> BYN",
    }


def apply_product_overrides(
    name: str | None,
    price: float | None,
    custom_name: str | None = None,
    vendor: str | None = None,
    custom_vendor: str | None = None,
    price_override: float | None = None,
) -> dict[str, Any]:
    """Вернуть итоговые значения товара с учетом пользовательских правок."""
    effective_name = custom_name.strip() if isinstance(custom_name, str) and custom_name.strip() else name
    effective_vendor = custom_vendor.strip() if isinstance(custom_vendor, str) and custom_vendor.strip() else vendor
    effective_price = normalize_display_price(price_override)
    if effective_price is None:
        effective_price = normalize_display_price(price)

    return {
        "name": effective_name,
        "vendor": effective_vendor,
        "price": effective_price,
        "name_overridden": bool(effective_name and effective_name != name),
        "vendor_overridden": bool(effective_vendor and effective_vendor != vendor),
        "price_overridden": to_float(price_override) is not None,
    }
