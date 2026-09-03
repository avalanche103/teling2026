@echo off
setlocal
cd /d "%~dp0"

echo [*] Teling local dev (Next.js + SSD)
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [!] Node.js not found. Install from https://nodejs.org/
    pause
    exit /b 1
)

where python >nul 2>&1
if errorlevel 1 (
    echo [!] Python not found. Install Python 3 for SSD module.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [*] Installing npm dependencies...
    call npm install
    if errorlevel 1 (
        echo [!] npm install failed
        pause
        exit /b 1
    )
)

python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [*] Installing SSD Python dependencies...
    python -m pip install -r ssd-admin-app\requirements.txt
    if errorlevel 1 (
        echo [!] pip install failed
        pause
        exit /b 1
    )
)

echo.
echo [*] Starting:
echo     Site:  http://localhost:6001
echo     SSD:   http://localhost:6001/ssd  (Flask on :5050)
echo     Note:  port 6000 is blocked by Next.js/browsers (X11)
echo     Stop:  Ctrl+C
echo.

call npm run dev

if errorlevel 1 pause
endlocal
