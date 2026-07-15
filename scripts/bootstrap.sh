#!/usr/bin/env bash
# Installs deps and sanity-checks the toolchain for application/.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_DIR="$ROOT_DIR/application"

REQUIRED_NODE_MAJOR=18
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt "$REQUIRED_NODE_MAJOR" ]; then
  echo "Node >= ${REQUIRED_NODE_MAJOR} required, found $(node -v)" >&2
  exit 1
fi

cd "$APP_DIR"
echo "==> Installing dependencies (application/)"
npm install

echo "==> Typecheck"
npm run typecheck

echo "==> Tests"
npm test

echo
echo "Bootstrap done. Try:"
echo "  cd application && npm run dev     # dashboard dev server"
echo "  cd application && npm test        # test suite"
