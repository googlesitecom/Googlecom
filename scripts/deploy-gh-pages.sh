#!/bin/bash
# Despliega out/ como rama gh-pages (sitio estático de GitHub Pages)
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

TMP="$REPO_ROOT/.gh-pages-tmp"
rm -rf "$TMP"

# worktree temporal en una rama huérfana
git worktree prune >/dev/null 2>&1 || true
rm -rf "$TMP" "$REPO_ROOT/.git/worktrees/-gh-pages-tmp" 2>/dev/null || true
git worktree add -f --detach "$TMP" HEAD
cd "$TMP"
git branch -D gh-pages >/dev/null 2>&1 || true   # borrar la local anterior (la remota se sobreescribe)
git checkout --orphan gh-pages >/dev/null 2>&1
git rm -rf --cached . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

# contenido del sitio estático
cp -r "$REPO_ROOT/out/." .
touch .nojekyll   # imprescindible: sin esto Jekyll ignora _next/

git add -A
git -c user.name="Super Z" -c user.email="dev@fronteracero.local" \
  commit -m "deploy: v11 — REAL online layer (MQTT public brokers): friends with request+acceptance, squads, BR lobby with 4 REAL operators countdown, BR aiming/controls/pause parity, denser island, guest lobby fix" >/dev/null
git push "${GITHUB_PUSH_URL:?exporta GITHUB_PUSH_URL=https://x-access-token:TOKEN@github.com/googlesitecom/Googlecom.git}" gh-pages:gh-pages --force 2>&1 | tail -2

cd "$REPO_ROOT"
git worktree remove "$TMP" --force
echo "OK: rama gh-pages publicada"
