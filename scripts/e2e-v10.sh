#!/bin/bash
# E2E v10 — sirve out/ y corre la verificación Playwright
cd "$(dirname "$0")/.."
pkill -f "serve-static.mjs" 2>/dev/null || true
sleep 1
node scripts/serve-static.mjs &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
sleep 1.5
python3 scripts/e2e_v10.py
exit $?
