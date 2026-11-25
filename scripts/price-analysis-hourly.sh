#!/usr/bin/env bash
# Hourly price-analysis batch (10 SKUs). New ISO week starts on first successful tick.
# Invoked by cron: 0 * * * *
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

LOG_DIR="$ROOT/data"
mkdir -p "$LOG_DIR"
STDOUT_LOG="$LOG_DIR/price-analysis-cron-stdout.log"
STDERR_LOG="$LOG_DIR/price-analysis-cron-stderr.log"

# Load secret from .env.production if present (Next process has it; cron may not).
if [[ -f "$ROOT/.env.production" ]]; then
  set -a
  # shellcheck disable=SC1091
  source <(grep -E '^PRICE_ANALYSIS_CRON_SECRET=' "$ROOT/.env.production" | sed 's/\r$//')
  set +a
fi

SECRET="${PRICE_ANALYSIS_CRON_SECRET:-}"
URL="${PRICE_ANALYSIS_CRON_URL:-http://127.0.0.1:10024/api/admin/price-analysis/cron}"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') price-analysis cron start ====="
} >>"$STDOUT_LOG"

trim_log() {
  local file="$1"
  if [[ -f "$file" ]] && [[ "$(wc -c <"$file")" -gt 2000000 ]]; then
    tail -c 1000000 "$file" >"${file}.tmp" && mv "${file}.tmp" "$file"
  fi
}
trim_log "$STDOUT_LOG"
trim_log "$STDERR_LOG"

if [[ -z "$SECRET" ]]; then
  echo "PRICE_ANALYSIS_CRON_SECRET missing" >>"$STDERR_LOG"
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') price-analysis cron exit=1 (no secret) =====" >>"$STDOUT_LOG"
  exit 1
fi

set +e
HTTP_CODE=$(curl -sS -o /tmp/price-analysis-cron-body.json -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${SECRET}" \
  -H "Content-Type: application/json" \
  --max-time 280 \
  "$URL")
CURL_EXIT=$?
set -e

{
  echo "http=$HTTP_CODE curl_exit=$CURL_EXIT"
  if [[ -f /tmp/price-analysis-cron-body.json ]]; then
    head -c 2000 /tmp/price-analysis-cron-body.json
    echo
  fi
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') price-analysis cron end ====="
} >>"$STDOUT_LOG"

if [[ "$CURL_EXIT" -ne 0 ]] || [[ "$HTTP_CODE" != "200" ]]; then
  echo "cron failed http=$HTTP_CODE curl=$CURL_EXIT" >>"$STDERR_LOG"
  exit 1
fi

exit 0
