# Teling Chat — десктоп-клиент оператора

Windows-приложение на **Tauri 2**: отдельное окно только для чата
`https://teling.by/login?client=desktop` → `/operator/chat` (без каталога, товаров и остальной админки).

Даже с паролем админа в клиенте доступен только чат. Полная админка — через браузер.

## Требования к ПК оператора

- Windows 10/11
- Интернет до `teling.by`
- Microsoft Edge WebView2 (обычно уже установлен; установщик при необходимости скачает bootstrapper)
- Учётка сотрудника с ролью `operator`, `employee` или `admin`

## Установка на рабочий ПК

1. Соберите установщик (см. ниже) или возьмите готовый файл из `src-tauri/target/release/bundle/`.
2. Запустите **NSIS** (`.exe`) или **MSI** (`.msi`).
3. Откройте **Teling Chat**, войдите логином оператора.
4. Автозапуск включается при первом старте. После перезагрузки Windows приложение поднимается в трее (`--hidden`).

### Трей

- Левый клик по иконке — открыть окно
- Правый клик: **Открыть** / **Скрыть** / **Выход**
- Крестик окна **не завершает** процесс — сворачивает в трей (чтобы polling и heartbeat продолжали работать)
- Новый чат в очереди: окно само разворачивается из трея (нужен клиент ≥ 0.1.1)

## Сборка (машина разработчика)

Нужны:

- [Node.js](https://nodejs.org/) + npm
- [Rust](https://rustup.rs/) (stable)
- Visual Studio Build Tools с workload **Desktop development with C++**
- WebView2 Runtime

```powershell
cd operator-desktop
npm install
# Если link.exe не в PATH — через helper (поднимает vcvars64):
.\build.ps1
# или вручную из Developer Command Prompt / после vcvars64.bat:
npm run build
```

Готовые установщики:

- `src-tauri/target/release/bundle/nsis/Teling Chat_*_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Teling Chat_*_x64_en-US.msi`

Для быстрой проверки без установщика (тоже нужен MSVC в PATH):

```powershell
npm run dev
```

### Локальный сайт вместо продакшена

Запустите Next.js на порту 6001, затем:

```powershell
$env:TELING_OPERATOR_URL = "http://localhost:6001/login?client=desktop"
npm run dev
```


## Ограничения

- Без сети к `teling.by` чат недоступен
- Статус «оператор онлайн» — in-memory heartbeat на сервере (как в браузере)
- Нативные уведомления ОС зависят от разрешений Windows; виджет сайта по-прежнему использует browser Notification API в WebView
