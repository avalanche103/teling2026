#!/usr/bin/env bash
# Production Microinform daily price sync wrapper.
# Protocol: fetch XLS → apply prices/delivery → hide absent → new SKUs stay pending
# (no auto-enrich / no auto-publish). Invoked by cron at 09:30 Europe/Minsk.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export TZ="${TZ:-Europe/Minsk}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=768}"

LOG_DIR="$ROOT/data/microinform"
mkdir -p "$LOG_DIR"
STDOUT_LOG="$LOG_DIR/sync-cron-stdout.log"
STDERR_LOG="$LOG_DIR/sync-cron-stderr.log"

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') microinform:sync start ====="
} >>"$STDOUT_LOG"

# Keep cron logs bounded (~last ~2 MB).
trim_log() {
  local file="$1"
  if [[ -f "$file" ]] && [[ "$(wc -c <"$file")" -gt 2000000 ]]; then
    tail -c 1000000 "$file" >"${file}.tmp" && mv "${file}.tmp" "$file"
  fi
}
trim_log "$STDOUT_LOG"
trim_log "$STDERR_LOG"

set +e
npm run microinform:sync >>"$STDOUT_LOG" 2>>"$STDERR_LOG"
code=$?
set -e

{
  echo "===== $(date '+%Y-%m-%d %H:%M:%S %Z') microinform:sync exit=$code ====="
} >>"$STDOUT_LOG"

exit "$code"
