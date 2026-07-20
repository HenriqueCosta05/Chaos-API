#!/usr/bin/env sh
# Inicializa e builda o ChaosAPI: prepara config, baixa deps, valida, builda, smoke-test.
#
# Uso: bootstrap.sh [--run] [--config PATH] [--force] [--skip-tests]
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
APP_ROOT="$REPO_ROOT/application"

RUN=0
FORCE=0
SKIP_TESTS=0
CONFIG_PATH=""

while [ $# -gt 0 ]; do
  case "$1" in
    --run) RUN=1; shift ;;
    --config) CONFIG_PATH="$2"; shift 2 ;;
    --force) FORCE=1; shift ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    *) printf 'Argumento desconhecido: %s\n' "$1" >&2; exit 1 ;;
  esac
done

step() { printf '\033[36m==> %s\033[0m\n' "$1"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$1"; }

# --- 1. Pre-flight ---------------------------------------------------------

step 'Checando dependencias de build'
command -v go >/dev/null 2>&1 || {
  printf '%s\n' 'Go nao encontrado no PATH. Instale em https://go.dev/dl/ antes de continuar.' >&2
  exit 1
}
ok "$(go version)"

# --- 2. Config ---------------------------------------------------------------

step 'Preparando configuracao'

CONFIG_DIR="$APP_ROOT/configs"
EXAMPLE_CONFIG="$CONFIG_DIR/chaosapi.yaml.example"
TARGET_CONFIG=${CONFIG_PATH:-"$CONFIG_DIR/chaosapi.yaml"}

if [ -f "$TARGET_CONFIG" ] && [ "$FORCE" -eq 0 ]; then
  ok "Config ja existe em $TARGET_CONFIG (use --force para sobrescrever)"
elif [ -f "$EXAMPLE_CONFIG" ]; then
  cp "$EXAMPLE_CONFIG" "$TARGET_CONFIG"
  ok "Config criada em $TARGET_CONFIG a partir do template"
else
  printf 'AVISO: nenhum template em %s e nenhuma config em %s. Build vai continuar, mas o binario nao vai subir sem uma config valida.\n' "$EXAMPLE_CONFIG" "$TARGET_CONFIG" >&2
fi

# --- 3. Deps + testes ---------------------------------------------------------

step 'Baixando dependencias (go mod download)'
(
  cd "$APP_ROOT"
  go mod download
  go vet ./...
)
ok 'go mod download + go vet ok'

if [ "$SKIP_TESTS" -eq 0 ]; then
  step 'Rodando testes (go test ./...)'
  (
    cd "$APP_ROOT"
    go test ./...
  )
  ok 'Testes ok'
else
  printf 'AVISO: testes pulados (--skip-tests)\n' >&2
fi

# --- 4. Build ------------------------------------------------------------------

step 'Buildando binario'

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
ok "Binario gerado em $BINARY (version=$VERSION commit=$COMMIT)"

# --- 5. Smoke test ---------------------------------------------------------------

step 'Smoke test do binario'
"$BINARY" -version
ok 'Binario executa corretamente'

# --- 6. Run (opcional) -----------------------------------------------------------

if [ "$RUN" -eq 1 ]; then
  step "Subindo ChaosAPI com config $TARGET_CONFIG"
  exec "$BINARY" -config "$TARGET_CONFIG"
else
  printf '\n\033[36mPronto. Para rodar:\033[0m\n'
  printf '  %s -config %s\n\n' "$BINARY" "$TARGET_CONFIG"
  printf '\033[36mOu de novo com este script:\033[0m\n'
  printf '  ./scripts/bootstrap/bootstrap.sh --run\n'
fi
