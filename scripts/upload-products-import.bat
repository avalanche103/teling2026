@echo off
setlocal
cd /d "%~dp0\.."

set "SRC=%~1"
if "%SRC%"=="" set "SRC=data\products.json"

if not exist "%SRC%" (
  echo [!] File not found: %SRC%
  echo Usage: scripts\upload-products-import.bat [path\to\products.json]
  pause
  exit /b 1
)

echo [*] Uploading %SRC% to server as data/products.import.upload.json ...
scp -i "%USERPROFILE%\.ssh\id_ed25519_teling" -o IdentitiesOnly=yes "%SRC%" user@134.17.16.134:/opt/teling/data/products.import.upload.json
if errorlevel 1 (
  echo [!] SCP failed
  pause
  exit /b 1
)

echo [*] Done. Open https://teling.by/admin/products and click "Анализ файла на сервере"
pause
endlocal
