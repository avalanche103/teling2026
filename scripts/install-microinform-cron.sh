#!/usr/bin/env bash
# Install / refresh the production cron job for Microinform daily sync.
# Schedule: 09:30 Europe/Minsk = 06:30 UTC (VPS clock is UTC; CRON_TZ unreliable here).
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

# Drop previously managed marker lines and any orphaned CRON_TZ=Europe/Minsk line
# that only existed for this job.
FILTERED="$(
  printf '%s\n' "$EXISTING" | awk -v marker="$MARKER" '
    BEGIN { prev="" }
    {
      if ($0 ~ marker) { prev=""; next }
      if (prev != "") {
        if (prev ~ /^CRON_TZ=Europe\/Minsk[[:space:]]*$/) { prev=$0; next }
        print prev
      }
      prev=$0
    }
    END {
      if (prev != "" && prev !~ marker && prev !~ /^CRON_TZ=Europe\/Minsk[[:space:]]*$/) print prev
    }
  '
)"

# Host clock is UTC. 06:30 UTC == 09:30 Europe/Minsk year-round (no DST).
# Do not rely on CRON_TZ — on this VPS it was ignored and the job ran at 09:30 UTC.
# Invoke via bash: deploys unpack this file as mode 0644, and cron then fails
# instantly with "Permission denied" (no MTA, so the error is discarded).
BLOCK=$(cat <<EOF
30 6 * * * /usr/bin/bash $WRAPPER $MARKER
EOF
)

TMP="$(mktemp)"
{
  printf '%s\n' "$FILTERED" | sed '/^[[:space:]]*$/d'
  printf '%s\n' "$BLOCK"
} >"$TMP"

crontab "$TMP"
rm -f "$TMP"

echo "Installed Microinform cron (06:30 UTC = 09:30 Europe/Minsk):"
crontab -l
echo
echo "Wrapper: $WRAPPER"
echo "Logs:    $ROOT/data/microinform/sync-cron-stdout.log"
echo "Manual:  $WRAPPER"
