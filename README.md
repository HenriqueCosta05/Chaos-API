# ChaosAPI

> **API de caos controlado para testar resiliência de serviços HTTP** — injete latência, erros, timeouts, disconnects, truncamento e corrupção de payload via proxy reverso configurável. Single binary, sem sidecar, sem Kubernetes, API-first.

---

## Visão rápida

| Comando | Descrição |
|---|---|
| `scripts/bootstrap/bootstrap.ps1 -Run` | Prepara o ambiente, gera a config local, roda testes, compila e sobe a API no Windows |
| `scripts/bootstrap/bootstrap.sh --run` | Mesma rotina de bootstrap no Linux/macOS |
| `scripts/publish/publish.ps1` | Empacota o binário e gera checksum para distribuição no Windows |
| `scripts/publish/publish.sh` | Mesma rotina de publicação no Linux/macOS |
| `go test ./...` em `application/` | Roda testes unit + integração |
| `go build -o ./bin/chaosapi ./cmd/chaosapi` em `application/` | Compila o binário single-file |
| `go run ./cmd/chaosapi -config ./configs/chaosapi.yaml` em `application/` | Executa a aplicação com a config local |
| `docker build -f deployment/Dockerfile -t ghcr.io/henri/chaosapi:dev .` | Build da imagem Docker |
| `docker compose -f deployment/docker-compose.yml up` | Sobe stack local com Prometheus e Grafana |

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

> **Limitação conhecida (WebSocket):** o upgrade HTTP → WebSocket é suportado como passthrough transparente, mas `latency` e `corrupt` não são aplicados por mensagem dentro de uma conexão WebSocket já estabelecida — só afetam o request HTTP inicial, se ele não fizer upgrade. `error`/`timeout`/`disconnect` continuam funcionando normalmente (agem antes do upgrade). Decisão e motivo em [ADR-005](docs/adr/005-defer-websocket-frame-chaos.md); planejado para v1.1.

---

## Quickstart

```bash
# 1. Clone e prepare o ambiente
git clone https://github.com/HenriqueCosta05/Chaos-API
cd chaosapi

# Windows
.\scripts\bootstrap\bootstrap.ps1 -Run

# Linux/macOS
./scripts/bootstrap/bootstrap.sh --run

# 2. Configure (exemplo em application/configs/chaosapi.yaml)
cat > application/configs/chaosapi.yaml <<'EOF'
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

# 3. Rode manualmente, se quiser controlar o processo
./application/bin/chaosapi -config application/configs/chaosapi.yaml
```

Agora aponte seu cliente para `http://localhost:8080` em vez do upstream real.

### Validar config sem subir o servidor

```bash
./application/bin/chaosapi -config application/configs/chaosapi.yaml -validate-config
```

Útil em CI / pre-flight de deploy: faz parse + validação e sai sem abrir portas.

### Exit codes

| Código | Significado |
|---|---|
| `0` | Sucesso |
| `1` | Erro genérico não classificado |
| `2` | Config inválida (parse ou validação falhou) |
| `3` | URL de upstream inválida |
| `4` | Falha ao inicializar o proxy |
| `5` | Falha ao fazer bind da porta do servidor |

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

**Semântica de reload — não são a mesma coisa:**
- `POST /admin/reload` (ou qualquer CRUD via `/admin/policies`) sincroniza **memória → engine**: reaplica as políticas que o `AdminServer` já tem em memória para o `policy.Engine`. Não relê o arquivo YAML do disco.
- `SIGHUP` (ou o sinal configurado em `hot_reload.signal`) relê o arquivo **disco → engine + AdminServer**: `config.Load` roda de novo, e tanto o `policy.Engine` quanto o `AdminServer` são sincronizados com o que está no arquivo.

Ou seja: mudanças feitas via Admin API sobrevivem até o próximo `SIGHUP` ou restart, mas **não são persistidas no arquivo YAML** — um `SIGHUP` depois de um `POST /admin/policies` descarta a mudança feita via API se ela não foi refletida no arquivo.

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

Ver [`application/configs/chaosapi.yaml.example`](application/configs/chaosapi.yaml.example) para todas as opções.

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
docker build -f deployment/Dockerfile -t ghcr.io/henri/chaosapi:latest .

# Run
docker run -p 8080:8080 -p 9090:9090 \
  -v $(pwd)/application/configs/chaosapi.yaml:/etc/chaosapi/chaosapi.yaml:ro \
  ghcr.io/henri/chaosapi:latest

# Ou docker-compose (inclui Prometheus + Grafana)
docker compose -f deployment/docker-compose.yml up
```

---

## Desenvolvimento

### Pré-requisitos
- Go 1.22+
- `golangci-lint` (`go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`)
- `air` para hot-reload (`go install github.com/air-verse/air@latest`)
- `make` é opcional e só necessário se você quiser usar os alvos do `application/Makefile` em ambientes com GNU Make disponível

### Comandos úteis
```bash
go test ./...                     # Testes unit + integração em application/
go test -race ./...               # Testes com race detector
go build -o ./bin/chaosapi ./cmd/chaosapi   # Binary local
go run ./cmd/chaosapi -config ./configs/chaosapi.yaml   # Execução direta
./scripts/bootstrap/bootstrap.sh --run      # Prepara e sobe a aplicação localmente
./scripts/publish/publish.sh                # Gera artefato distribuível local
docker build -f deployment/Dockerfile -t ghcr.io/henri/chaosapi:latest .
docker compose -f deployment/docker-compose.yml up
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
│   ├── configs/             # Config examples e arquivo local gerado
│   └── test/                # Test utilities, fixtures
├── deployment/              # Dockerfile, docker-compose, Prometheus
├── docs/                    # PRD, CONVENTIONS, DESIGN, TODO, CHANGELOG
├── scripts/                 # Bootstrap, publish scripts
└── application/Makefile     # Alvos opcionais para quem tiver GNU Make
```

---

## Contribuindo

1. Leia [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — convenções de código, arquitetura, git
2. Abra issue para discutir mudanças grandes (nova policy, breaking change)
3. PRs pequenos (< 400 linhas), testes incluídos, docs atualizadas no mesmo PR
4. `go test ./...` deve passar; se você usar GNU Make, `make -C application lint` e `make -C application test` também devem passar

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