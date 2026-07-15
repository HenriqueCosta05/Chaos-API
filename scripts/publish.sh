#!/usr/bin/env bash
# Builds and publishes application/ to npm. See deployment/README.md for the pipeline this mirrors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/application"

ALLOW_DIRTY=false
for arg in "$@"; do
  case "$arg" in
    --allow-dirty) ALLOW_DIRTY=true ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

if [ "$ALLOW_DIRTY" = false ] && [ -n "$(git -C "$ROOT_DIR" status --porcelain)" ]; then
  echo "Working tree has uncommitted changes. Commit/stash first, or pass --allow-dirty." >&2
  exit 1
fi

if ! npm whoami >/dev/null 2>&1; then
  echo "Not logged in to npm. Run 'npm login' (or set NPM_TOKEN) first." >&2
  exit 1
fi

cd "$APP_DIR"

echo "==> Typecheck"
npm run typecheck

echo "==> Tests"
npm test

echo "==> Build"
npm run build

echo "==> Publish"
npm publish --access public

echo
echo "Published $(node -p "require('./package.json').name")@$(node -p "require('./package.json').version")"
