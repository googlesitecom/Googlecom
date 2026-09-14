#!/bin/bash
# v13.6: prepara la rama huérfana gh-pages con el build NUEVO (sin push —
# el push lo hace scripts/deploy-gh-pages.sh cuando haya PAT nuevo)
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
touch .nojekyll   # imprescindible: sin esto Jekyll ignora _next/

git add -A
git -c user.name="Super Z" -c user.email="dev@fronteracero.local" \
  commit -m "deploy: v14.2 — pose de descanso + avión y drops rediseñados + mega market/arsenal + trincheras" >/dev/null

echo "gh-pages local lista:"
git log --oneline -1
echo "archivos: $(git ls-files | wc -l)"

cd "$REPO_ROOT"
git worktree remove "$TMP" --force
echo "OK — push pendiente: git push origin main && git push origin gh-pages --force (con PAT nuevo)"
