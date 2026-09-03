#!/bin/bash
# Run once on the server with sudo:
#   sudo bash /opt/teling/scripts/fix-production-nginx.sh
set -e

CONFIG="/etc/nginx/sites-enabled/teling.by"

if grep -q 'client_max_body_size' "$CONFIG"; then
  echo "[*] client_max_body_size already configured"
else
  sed -i '/location \^~ \/api\/ {/a\        client_max_body_size 200m;' "$CONFIG"
  echo "[*] Added client_max_body_size 200m to /api/"
fi

nginx -t
systemctl reload nginx
echo "[*] nginx reloaded"
