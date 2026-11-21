#!/usr/bin/env bash
# Install / refresh the production cron job for Microinform daily sync.
# Schedule: 09:30 Europe/Minsk every day (CRON_TZ).
#
# Usage on VPS:
#   bash /opt/teling/scripts/install-microinform-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WRAPPER="$ROOT/scripts/microinform-daily-sync.sh"
MARKER="# teling-microinform-daily-sync"

if [[ ! -f "$WRAPPER" ]]; then
  echo "Missing wrapper: $WRAPPER" >&2
  exit 1
fi

chmod +x "$WRAPPER" "$ROOT/scripts/install-microinform-cron.sh"

EXISTING="$(crontab -l 2>/dev/null || true)"

# Drop previously managed block: optional CRON_TZ=Europe/Minsk followed by marker line,
# or a lone marker line.
FILTERED="$(
  printf '%s\n' "$EXISTING" | awk -v marker="$MARKER" '
    BEGIN { prev="" }
    {
      if ($0 ~ marker) { prev=""; next }
      if (prev ~ /^CRON_TZ=Europe\/Minsk[[:space:]]*$/ && $0 ~ marker) { prev=""; next }
      if (prev != "") print prev
      prev=$0
    }
    END {
      if (prev != "" && prev !~ marker) print prev
    }
  '
)"

# Also strip a trailing orphan CRON_TZ=Europe/Minsk left without a following job
# (only if it was our managed TZ and nothing else uses it — keep if other jobs need it).
# Safer: always append a fresh CRON_TZ + job pair; remove any line that already has our marker.

BLOCK=$(cat <<EOF
CRON_TZ=Europe/Minsk
30 9 * * * $WRAPPER $MARKER
EOF
)

TMP="$(mktemp)"
{
  printf '%s\n' "$FILTERED" | sed '/^[[:space:]]*$/d'
  printf '%s\n' "$BLOCK"
} >"$TMP"

crontab "$TMP"
rm -f "$TMP"

echo "Installed Microinform cron (09:30 Europe/Minsk):"
crontab -l
echo
echo "Wrapper: $WRAPPER"
echo "Logs:    $ROOT/data/microinform/sync-cron-stdout.log"
echo "Manual:  $WRAPPER"
