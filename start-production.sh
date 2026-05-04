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

# Start application
echo "[*] Starting Next.js production server..."
APP_PORT="${PORT:-10024}"
echo "[*] Binding to 127.0.0.1:${APP_PORT}"
exec ./node_modules/.bin/next start -H 127.0.0.1 -p "${APP_PORT}"
