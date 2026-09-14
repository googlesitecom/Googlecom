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
  commit -m "deploy: v15 — squad deploy estilo Fortnite (líder escoge modo + todos LISTO + auto-arranque)" >/dev/null

echo "gh-pages local lista:"
git log --oneline -1
echo "archivos: $(git ls-files | wc -l)"

cd "$REPO_ROOT"
git worktree remove "$TMP" --force
echo "OK — listo para: git push origin gh-pages --force (con PAT)"
