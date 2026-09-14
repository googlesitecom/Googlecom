#!/bin/bash
set -e
REPO_ROOT="/home/z/my-project"
cd "$REPO_ROOT"

TMP="$REPO_ROOT/.gh-pages-tmp"
rm -rf "$TMP"
git worktree prune >/dev/null 2>&1 || true
rm -rf "$REPO_ROOT/.git/worktrees/-gh-pages-tmp" 2>/dev/null || true
git worktree add -f --detach "$TMP" HEAD >/dev/null
cd "$TMP"
git branch -D gh-pages >/dev/null 2>&1 || true
git checkout --orphan gh-pages >/dev/null 2>&1
git rm -rf --cached . >/dev/null 2>&1 || true
find . -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +

cp -r "$REPO_ROOT/out/." .
touch .nojekyll

git add -A
git -c user.name="Super Z" -c user.email="dev@fronteracero.local" \
  commit -m "deploy: v15.1 — fixes online: pcode al canal del grupo (los miembros ya reciben la sala), elección de líder sin robo de mando, salas públicas con auto-inicio (2+ humanos), quick match con fallback a host + auto-despliegue en solitario, ICE/TURN modernos" >/dev/null
git push "${GITHUB_PUSH_URL:?exporta GITHUB_PUSH_URL}" gh-pages:gh-pages --force 2>&1 | tail -2

cd "$REPO_ROOT"
git worktree remove "$TMP" --force
echo "gh-pages deployed (v15.1)"
