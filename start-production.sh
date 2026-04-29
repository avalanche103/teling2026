#!/bin/bash
set -e

echo "[*] Production startup script"
echo "[*] Working directory: $(pwd)"

# Setup Node.js environment
source ~/.nvm/nvm.sh 2>/dev/null || true
nvm use 20 2>/dev/null || true

echo "[*] Node: $(node --version), npm: $(npm --version)"

# Install dependencies if needed
if [ ! -d node_modules ]; then
    echo "[*] Installing dependencies..."
    npm ci --omit=dev --no-progress
fi

# Build if .next doesn't exist
if [ ! -d .next ]; then
    echo "[*] Building application..."
    npm run build
else
    echo "[*] Build already exists, skipping build"
fi

# Start application
echo "[*] Starting Next.js production server..."
npm start
