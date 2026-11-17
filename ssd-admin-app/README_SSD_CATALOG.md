# SSD партнер API импорт в SQLite

Скрипт: `ssd_catalog_import.py`

## Что делает
- получает разделы из `https://ssd.ru/api/partner/catalog/sections`
- получает товары из `https://ssd.ru/api/partner/catalog/products` с пагинацией (`page`, `limit`)
- сохраняет в SQLite `ssd_catalog.db`:
  - таблица `sections`
  - таблица `products`

## Как запустить
1. Установить зависимости:
   - `pip install -r requirements.txt`
   - или отдельно: `pip install requests flask`
2. Выполнить:
   - `python ssd_catalog_import.py`
3. Проверить результаты:
   - `sqlite3 ssd_catalog.db` (или любой SQLite клиент)
   - `SELECT COUNT(*) FROM sections;`
   - `SELECT COUNT(*) FROM products;`

## Веб-интерфейс управления
Скрипт: `app.py`

### Что делает
- веб-приложение на Flask для управления каталогом
- запуск импорта с отслеживанием прогресса
- просмотр разделов и товаров
- экспорт данных в различные форматы

### Как запустить
- `python app.py`
- Открыть в браузере: `http://localhost:5050`

### Функции
- **Главная**: статистика базы, запуск импорта с прогресс-баром
- **Разделы**: таблица всех разделов с количеством товаров
- **Товары**: таблица товаров с фильтрацией, поиском и сохранением пользовательских правок перед выгрузкой
- **Экспорт**: JSON/CSV скачиваются локально в ZIP (с выбором пути), изображения пишутся в `public/images/`
- **Переименование и цена**: можно задать свое название и при необходимости свою итоговую цену в BYN для товара; правки сохраняются отдельно и не теряются при следующих обновлениях
- **Ценообразование**: цена для сайта считается автоматически по скидке дистрибьютора и переводится в белорусские рубли (`Br`) с округлением, удобным для НДС 20%
- **Курс RUB → BYN**: задается в веб-интерфейсе на главной странице или в разделе «Экспорт»; сохраняется в `ssd-admin-app/settings.json` и используется при расчете и выгрузке цен

## Экспорт для сайта
Скрипт: `export_for_site.py`

### Что делает
- экспортирует данные из `ssd_catalog.db` в JSON файлы
- в веб-интерфейсе всегда скачивает ZIP на компьютер пользователя (и локально, и на бою), с диалогом выбора пути
- CLI по умолчанию пишет в `ssd-admin-app/export/` (можно указать `--output-dir`)
- применяет сохраненные пользовательские правки к названиям и ценам перед выгрузкой
- рассчитывает итоговую цену для сайта в белорусских рублях (`Br`) по правилам:
  - скидка дистрибьютора `>= 25%` → наценка `+50%`
  - скидка `> 5% и < 25%` → наценка `+30%`
  - скидка `<= 5%` → наценка `+20%`
- после пересчета округляет цену так, чтобы стоимость без НДС и НДС 20% были удобными целыми/десятичными значениями
- добавляет в товары поле со скидкой дистрибьютора из SSD API
- `sections.json` - список разделов
- `products.json` - список товаров с привязкой к разделам
- `catalog_tree.json` - дерево каталога (разделы с вложенными продуктами)

### Как запустить
- `python export_for_site.py`

### После экспорта / импорта на сайт
1. Скопировать/залить **`products.json`** в `data/` сайта.
2. **Не перезаписывать** `data/sections.json` целиком ZIP/export-файлом — там же живут разделы Microinform (632–644). Вместо этого смержить разделы:
   - `python merge_sections.py` из `ssd-admin-app/`
   - или `python export_for_site.py --apply-sections-to-site`
   - merge делает upsert SSD-разделов, сохраняет local-only / Microinform и `metadata.selected_filters`
3. Локальные правки разделов (имя/родитель) — `section_overrides.json`; применяются при `merge_sections.py` и `export_for_site.py`, чтобы битые данные SSD API (например id 329 «муфты») не возвращались.
4. Проверка дрейфа: `python audit_catalog_drift.py` (exit code ≠ 0 при missing/orphan).
5. Скачать картинки: `npm run ssd:download-images` (или кнопка «изображения» в SSD admin → `/run_export` type=images).
6. JSON URL **не** переписываются: сайт сам предпочтёт `/images/<SKU>_1.*`, если файл есть.
7. На прод: `.\scripts\sync-images.ps1` (deploy.tar картинки не включает).

### Структура файлов
- `sections.json`: массив объектов с `id`, `name`, `parent`, `external_id`, `metadata`
- `products.json`: массив объектов с итоговым `name`, исходным `original_name`, итоговой ценой `price` в `Br`, расчетной `calculated_price`, ручной `price_override`, `price_without_vat`, `vat_amount`, `markup_percent`, `distributor_discount`, `stock`, `vendor`, `metadata`, `raw_json`
- `catalog_tree.json`: дерево разделов с продуктами внутри

## Экспорт в CSV
Скрипт: `export_csv.py`

### Что делает
- экспортирует данные в CSV формат для Excel/таблиц
- в веб-интерфейсе скачивает ZIP локально с выбором пути; CLI пишет в `ssd-admin-app/export/`
- `sections.csv` - разделы
- `products.csv` - товары с итоговым названием, исходным названием, скидкой и ссылками на изображения

### Как запустить
- `python export_csv.py`

## Скачивание изображений
Скрипт: `download_images.py`

### Зачем
Сайт **не переписывает** URL в `data/products.json`. В JSON остаются ссылки `https://ssd.ru/...` как fallback.
Если в `public/images/` есть файл `<SKU>_1.webp|jpg|...`, карточки, листинг и «Вы смотрели» берут **локальный** путь `/images/...` (local-first в `lib/data.ts`).

### Что делает
- скачивает изображения товаров в `public/images/` основного проекта
- читает URL из `raw_json.pictures` (или `metadata.pictures`)
- сохраняет файлы как `<артикул>_<номер>.<расширение>`, например `110302-00011_1.webp`
- уже существующие файлы пропускает; качает параллельно (`--workers`)

### Когда запускать
После импорта/экспорта каталога SSD (когда обновился `export/products.json` или `data/products.json`):

```bash
# из корня проекта
npm run ssd:download-images:smoke    # 20 товаров, проверка
npm run ssd:download-images:thumbs   # только _1.* (~7.5k) — карточки / «Вы смотрели»
npm run ssd:download-images          # полный прогон всех кадров галереи
npm run ssd:sync-images              # залить public/images на VPS

# или напрямую
cd ssd-admin-app
python download_images.py --limit 20 --workers 16
python download_images.py --first-only --workers 24
python download_images.py --workers 20
python download_images.py --from-site   # взять data/products.json
```

> Внимание: полный прогон (~23k URL) долгий из‑за ssd.ru. Для карточек достаточно `--first-only`. `public/images/` в git не коммитится и в deploy tar не входит — на прод: `npm run ssd:sync-images`.

## Что сейчас
- скрипт работает, получил `207` разделов и `500` товаров (одна страница).
- API иногда может таймаутиться (ReadTimedOut) из-за нестабильности HTTPS.

## Дополнительно
Можно расширить:
- добавить сохранение `totalQty`, `totalPages` из ответа (пагинация по целому объему);
- обновлять существующие записи (сейчас `INSERT OR REPLACE`);
- легкую миграцию в PostgreSQL/MySQL;
- обработку изображений/описаний для сайта.
