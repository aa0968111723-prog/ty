#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# Leftover GOOGLE_SHEET_TAB=國際生專區 is not in the workbook. Bind game writes
# to the live 09/14 tab (gid 896311128) unless a newer name is already set.
if [ -z "${GOOGLE_GAME_SHEET_TAB:-}" ]; then
  GOOGLE_GAME_SHEET_TAB="$(printf '%s/%s' '09' '14後玩遊戲')"
  export GOOGLE_GAME_SHEET_TAB
fi
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
mkdir -p node_modules/.cache
npm run dev >>node_modules/.cache/app-startup.log 2>&1 &
