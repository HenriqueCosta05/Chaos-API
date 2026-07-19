#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
APP_ROOT="$REPO_ROOT/application"
OUTPUT_DIR=${1:-"$REPO_ROOT/dist"}

command -v go >/dev/null 2>&1 || {
  printf '%s\n' 'Go nao encontrado no PATH.' >&2
  exit 1
}

mkdir -p "$OUTPUT_DIR"

VERSION=$(git -C "$REPO_ROOT" describe --tags --always --dirty 2>/dev/null || printf '%s' dev)
COMMIT=$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || printf '%s' none)
DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

ARTIFACT_ROOT="$OUTPUT_DIR/chaosapi-$VERSION"
BIN_DIR="$ARTIFACT_ROOT/bin"
CONFIG_DIR="$ARTIFACT_ROOT/configs"
mkdir -p "$BIN_DIR" "$CONFIG_DIR"

BINARY="$BIN_DIR/chaosapi"
LDFLAGS="-s -w -X main.version=$VERSION -X main.commit=$COMMIT -X main.date=$DATE"

(
  cd "$APP_ROOT"
  go build -ldflags "$LDFLAGS" -o "$BINARY" ./cmd/chaosapi
)

if [ -f "$APP_ROOT/configs/chaosapi.yaml.example" ]; then
  cp "$APP_ROOT/configs/chaosapi.yaml.example" "$CONFIG_DIR/chaosapi.yaml.example"
fi

ARCHIVE_PATH="$OUTPUT_DIR/chaosapi-$VERSION-linux-amd64.tar.gz"
tar -C "$OUTPUT_DIR" -czf "$ARCHIVE_PATH" "chaosapi-$VERSION"
sha256sum "$ARCHIVE_PATH" > "$ARCHIVE_PATH.sha256"

printf '%s\n' "Artefato publicado em $ARCHIVE_PATH"
printf '%s\n' "Checksum em $ARCHIVE_PATH.sha256"