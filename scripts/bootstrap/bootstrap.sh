#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
APP_ROOT="$REPO_ROOT/application"

command -v go >/dev/null 2>&1 || {
  printf '%s\n' 'Go nao encontrado no PATH.' >&2
  exit 1
}

CONFIG_DIR="$APP_ROOT/configs"
EXAMPLE_CONFIG="$CONFIG_DIR/chaosapi.yaml.example"
DEFAULT_CONFIG="$CONFIG_DIR/chaosapi.yaml"

if [ ! -f "$DEFAULT_CONFIG" ] && [ -f "$EXAMPLE_CONFIG" ]; then
  cp "$EXAMPLE_CONFIG" "$DEFAULT_CONFIG"
  printf '%s\n' "Config criada em $DEFAULT_CONFIG"
fi

(
  cd "$APP_ROOT"
  go mod download
  go test ./...
)

BUILD_DIR="$APP_ROOT/bin"
mkdir -p "$BUILD_DIR"

VERSION=$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || printf '%s' dev)
COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '%s' none)
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)
BINARY="$BUILD_DIR/chaosapi"
LDFLAGS="-s -w -X main.version=$VERSION -X main.commit=$COMMIT -X main.date=$DATE"

(
  cd "$APP_ROOT"
  go build -ldflags "$LDFLAGS" -o "$BINARY" ./cmd/chaosapi
)

printf '%s\n' "Binario gerado em $BINARY"

if [ "${1:-}" = "--run" ]; then
  shift
  "$BINARY" -config "$DEFAULT_CONFIG" "$@"
fi