#!/bin/bash
set -e

echo "[*] Production startup script"
echo "[*] Working directory: $(pwd)"

# Setup Node.js environment
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 20 2>/dev/null || true

echo "[*] Node: $(node --version), npm: $(npm --version)"

# Install dependencies on the server when they are missing.
if [ ! -d node_modules ]; then
    echo "[*] node_modules is missing, installing dependencies..."
    if [ -f package-lock.json ]; then
        npm ci --no-progress
    else
        npm install --no-progress
    fi
fi

# Always rebuild on startup so the running app matches the latest deployed sources.
echo "[*] Running Next.js production build..."
npm run build

echo "[*] Production build is ready"

METPAY_DIR="${METPAY_DIR:-./metpay}"
METPAY_PID=""

start_metpay() {
  local metpay_script="${METPAY_DIR}/backend/start-production.sh"
  if [ -f "${metpay_script}" ]; then
    echo "[*] Starting MetPay backend from ${METPAY_DIR}"
    bash "${metpay_script}" &
    METPAY_PID=$!
    echo "[*] MetPay PID: ${METPAY_PID}"
  else
    echo "[!] MetPay not found at ${METPAY_DIR}; webhook proxy expects backend on :8000"
  fi
}

cleanup() {
  if [ -n "${METPAY_PID}" ]; then
    kill "${METPAY_PID}" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM
start_metpay

# Start application
echo "[*] Starting Next.js production server..."
APP_PORT="${PORT:-10024}"
echo "[*] Binding to 127.0.0.1:${APP_PORT}"
exec ./node_modules/.bin/next start -H 127.0.0.1 -p "${APP_PORT}"
