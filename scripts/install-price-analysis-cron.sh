#!/usr/bin/env bash
# Install hourly price-analysis batch cron on the VPS (UTC clock).
# New ISO week starts on the first successful hourly tick, then +10 SKUs/hour.
#
# Usage on VPS:
#   bash /opt/teling/scripts/install-price-analysis-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT/scripts/price-analysis-hourly.sh"
MARKER="# teling-price-analysis-hourly"

if [[ ! -f "$WRAPPER" ]]; then
  echo "Missing wrapper: $WRAPPER" >&2
  exit 1
fi

chmod +x "$WRAPPER" "$ROOT/scripts/install-price-analysis-cron.sh"

EXISTING="$(crontab -l 2>/dev/null || true)"

FILTERED="$(
  printf '%s\n' "$EXISTING" | awk -v marker="$MARKER" '
    $0 ~ marker { next }
    { print }
  '
)"

BLOCK=$(cat <<EOF
0 * * * * $WRAPPER $MARKER
EOF
)

TMP="$(mktemp)"
{
  printf '%s\n' "$FILTERED" | sed '/^[[:space:]]*$/d'
  printf '%s\n' "$BLOCK"
} >"$TMP"

crontab "$TMP"
rm -f "$TMP"

echo "Installed price-analysis hourly cron (UTC):"
crontab -l | grep -F "$MARKER" || crontab -l
echo
echo "Wrapper: $WRAPPER"
echo "Requires: PRICE_ANALYSIS_CRON_SECRET in $ROOT/.env.production"
echo "Logs:    $ROOT/data/price-analysis-cron-stdout.log"
echo "Manual:  $WRAPPER"
