# ChaosAPI

> **API de caos controlado para testar resiliência de serviços HTTP** — injete latência, erros, timeouts, disconnects, truncamento e corrupção de payload via proxy reverso configurável. Single binary, sem sidecar, sem Kubernetes, API-first.

---

## Visão rápida

| Comando | Descrição |
|---|---|
| `make dev` | Sobe em modo dev com hot-reload (air) |
| `make test` | Roda testes unit + integração |
| `make build` | Compila binary single-file (`./bin/chaosapi`) |
| `make lint` | `golangci-lint` + `go vet` + `staticcheck` |
| `make docker` | Build multi-arch image (`ghcr.io/henri/chaosapi:dev`) |
| `make run` | Executa binary com `configs/chaosapi.yaml` |

---

## Por que ChaosAPI?

Sistemas distribuídos falham de formas imprevisíveis. Ferramentas de caos existentes (Chaos Mesh, Gremlin, Chaos Monkey) exigem:
- Kubernetes + operadores / sidecars / DaemonSets
- Acesso a infraestrutura de cluster
- Configuração complexa para testes simples de HTTP

**ChaosAPI** é diferente:
- **Proxy HTTP simples** — aponte seu cliente para `http://chaosapi:8080` em vez do downstream real
- **Configuração via YAML + API REST** — políticas de caos versionadas no Git
- **Single binary (~15MB)** — roda em qualquer container, VM, CI/CD, laptop
- **Zero dependências de infra** — não precisa de K8s, etcd, sidecar
- **Feito para CI/CD** — injete falhas determinísticas em pipelines

---

## Políticas de caos suportadas (v1.0)

| Política | Descrição | Parâmetros |
|---|---|---|
| `latency` | Adiciona latência fixa ou aleatória | `fixed_ms`, `min_ms`, `max_ms`, `jitter` |
| `error` | Retorna status HTTP configurado sem chamar downstream | `status_code`, `body`, `headers` |
| `timeout` | Fecha conexão após N ms (simula timeout de rede) | `timeout_ms` |
| `disconnect` | Fecha TCP com RST imediato (simula crash de rede) | — |
| `truncate` | Corta response body após N bytes | `max_bytes` |
| `corrupt` | Corrompe bytes aleatórios no request/response | `probability`, `byte_range` |

**Seletores** (combinados com AND): path regex, header exact/regex, query param, method, probability (%).

---

## Quickstart

```bash
# 1. Clone e build
git clone https://github.com/henri/chaosapi
cd chaosapi
make build

# 2. Configure (exemplo em configs/chaosapi.yaml)
cat > configs/chaosapi.yaml <<'EOF'
server:
  port: 8080
  read_timeout: 30s
  write_timeout: 30s

upstream:
  url: "https://api.payment-gateway.com"
  timeout: 10s
  tls_skip_verify: false

policies:
  - name: "payment-latency"
    selector:
      path_regex: "^/api/v1/payments"
      probability: 100
    latency:
      min_ms: 500
      max_ms: 2000

  - name: "notification-errors"
    selector:
      path_regex: "^/api/v1/notifications"
      probability: 10
    error:
      status_code: 503
      body: '{"error": "service unavailable"}'

metrics:
  enabled: true
  port: 9090

logging:
  level: info
  format: json
EOF

# 3. Rode
./bin/chaosapi -config configs/chaosapi.yaml
```

Agora aponte seu cliente para `http://localhost:8080` em vez do upstream real.

---

## API Admin (porta 8080 por padrão)

| Método | Path | Descrição |
|---|---|---|
| `GET` | `/healthz` | Liveness probe |
| `GET` | `/readyz` | Readiness probe |
| `GET` | `/metrics` | Métricas Prometheus |
| `GET` | `/admin/policies` | Lista todas as políticas |
| `POST` | `/admin/policies` | Cria política (valida + hot-reload) |
| `GET` | `/admin/policies/{id}` | Obtém política |
| `PUT` | `/admin/policies/{id}` | Atualiza política (hot-reload) |
| `DELETE` | `/admin/policies/{id}` | Remove política |
| `POST` | `/admin/reload` | Força reload do arquivo de config |

Exemplo payload política:
```json
{
  "name": "api-timeout",
  "selector": {
    "path_regex": "^/api/.*",
    "methods": ["POST", "PUT"],
    "probability": 50
  },
  "timeout": {
    "timeout_ms": 100
  }
}
```

---

## Métricas Prometheus

| Métrica | Tipo | Labels | Descrição |
|---|---|---|---|
| `chaosapi_requests_total` | Counter | `policy`, `result` (matched/skipped/error) | Total de requests |
| `chaosapi_request_duration_seconds` | Histogram | `policy` | Latência total (inclui overhead + policy) |
| `chaosapi_proxy_overhead_seconds` | Histogram | — | Overhead do proxy sem policy |
| `chaosapi_policy_matches_total` | Counter | `policy`, `action` | Matches por ação (latency/error/timeout/...) |
| `chaosapi_upstream_requests_total` | Counter | `status_class` (2xx/3xx/4xx/5xx) | Requests ao upstream |
| `chaosapi_config_reloads_total` | Counter | `result` (success/failed) | Hot-reloads de config |

---

## Configuração completa

Ver [`configs/chaosapi.yaml.example`](configs/chaosapi.yaml.example) para todas as opções.

Principais seções:
```yaml
server:          # HTTP server settings
upstream:        # Downstream real (target)
policies:        # Lista de políticas de caos
metrics:         # Prometheus exporter
logging:         # Structured logging (zerolog)
admin_api:       # Admin API auth (opcional: api_key, mtls)
```

Variáveis de ambiente (override config):
- `CHAOSAPI_SERVER_PORT`
- `CHAOSAPI_UPSTREAM_URL`
- `CHAOSAPI_LOG_LEVEL`
- `CHAOSAPI_METRICS_ENABLED`
- `CHAOSAPI_ADMIN_API_KEY`

---

## Docker

```bash
# Build local
make docker

# Run
docker run -p 8080:8080 -p 9090:9090 \
  -v $(pwd)/configs/chaosapi.yaml:/etc/chaosapi/chaosapi.yaml:ro \
  ghcr.io/henri/chaosapi:latest

# Ou docker-compose (inclui Prometheus + Grafana)
docker-compose -f deployments/docker-compose.yml up
```

---

## Desenvolvimento

### Pré-requisitos
- Go 1.22+
- `make` (GNU Make)
- `golangci-lint` (`go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`)
- `air` para hot-reload (`go install github.com/air-verse/air@latest`)

### Comandos úteis
```bash
make dev          # Dev com hot-reload (air)
make test         # Testes unit + integração
make test-cover   # Coverage report (html)
make lint         # Lint completo
make fmt          # gofmt + goimports
make build        # Binary em ./bin/chaosapi
make docker       # Multi-arch image
make release      # Goreleaser (tag required)
```

### Estrutura do projeto
```
.
├── application/
│   ├── cmd/chaosapi/        # Entry point
│   ├── internal/
│   │   ├── config/          # Config loading/validation
│   │   ├── policy/          # Policy engine + selectors
│   │   ├── proxy/           # Reverse proxy + chaos middleware
│   │   ├── metrics/         # Prometheus metrics
│   │   ├── logging/         # Zerolog setup
│   │   └── health/          # Health/readiness
│   ├── pkg/models/          # Shared types (Policy, Selector, etc.)
│   └── test/                # Test utilities, fixtures
├── configs/                 # Config examples
├── deployments/             # Dockerfile, docker-compose, k8s
├── docs/                    # PRD, CONVENTIONS, DESIGN, TODO, CHANGELOG
├── scripts/                 # Bootstrap, publish scripts
└── Makefile
```

---

## Contribuindo

1. Leia [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — convenções de código, arquitetura, git
2. Abra issue para discutir mudanças grandes (nova policy, breaking change)
3. PRs pequenos (< 400 linhas), testes incluídos, docs atualizadas no mesmo PR
4. `make lint` e `make test` devem passar

---

## Licença

MIT — veja [LICENSE](LICENSE).

---

## Links

- [PRD — Product Requirements](docs/PRD.md)
- [CONVENTIONS — Arquitetura e código](docs/CONVENTIONS.md)
- [DESIGN — Design system / UI tokens](docs/DESIGN.md)
- [CHANGELOG](CHANGELOG.md)
- [TODO / Backlog](docs/TODO.md)