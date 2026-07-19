# Design Spec — ChaosAPI

Concrete tokens and component rules for CLI/API output, not a mood board.

## Brand

- **Name:** ChaosAPI
- **Tone:** Technical, precise, operator-focused — "instrument, don't decorate"
  - *Regra:* Outputs são machine-parseable por default (JSON), human-readable com flag `--output=table`
  - *Regra:* Cores apenas em output TTY; logs estruturados sempre JSON
  - *Regra:* Zero emoji, zero marketing speak em CLI/API

## Color tokens (CLI output TTY)

| Token | Value | Usage |
|---|---|---|
| `color-primary` | `#00D4AA` (teal) | Headers, success, active policy |
| `color-warning` | `#F5A623` (amber) | Warnings, partial matches |
| `color-error` | `#FF4757` (red) | Errors, failed requests, disconnects |
| `color-muted` | `#7F8C8D` (gray) | Metadata, timestamps, disabled policies |
| `color-bg` | `#1E1E1E` (dark) / `#FFFFFF` (light) | Background (auto-detect) |
| `color-text` | `#E0E0E0` / `#1A1A1A` | Primary text |

> **Nota:** ChaosAPI é API-first; CLI é ferramenta de debug/admin. Tokens acima só se aplicam a `chaosapi CLI` output colorido.

## Typography (CLI)

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading | System monospace | 12pt | Bold |
| Body | System monospace | 11pt | Regular |
| Code / JSON | System monospace | 10pt | Regular |
| Metadata | System monospace | 10pt | Regular |

## Spacing scale

Base unit: 2 chars (colunas)
- `xs`: 2
- `sm`: 4
- `md`: 8
- `lg`: 16
- `xl`: 24

## Component specs

### CLI Command Output — Policy List (`chaosapi policy list`)

- **Variants:** `--output=table` (default TTY), `--output=json`, `--output=yaml`
- **States:** active (green), inactive (muted), error (red)
- **Columns (table):** NAME | SELECTOR | ACTION | PROB | STATUS
- **Do:** Truncate long selectors com `...`; show full em JSON
- **Don't:** Color em non-TTY; paginar sem flag `--page-size`

### CLI Command Output — Policy Create/Update (`chaosapi policy apply -f file.yaml`)

- **Success:** Single line `policy "payment-latency" applied (revision 3)`
- **Error:** Structured: `ERROR: validation failed: selector.path_regex: invalid regex "["`
- **Do:** Print revision number para auditoria
- **Don't:** Pretty-print YAML de volta a menos que `--dry-run`

### CLI Command Output — Top/Stats (`chaosapi top`)

- **Layout:** Live-updating table (TTY) ou snapshot (JSON)
- **Columns:** POLICY | MATCHES | AVG_LATENCY | ERROR_RATE | P99_OVERHEAD
- **Refresh:** 2s default, `--interval` configurável
- **Do:** Sort por MATCHES desc por default
- **Don't:** Manter histórico em memória > 10min sem flag

### Admin API Response Format

- **Success (2xx):** Envelope `{ "data": <T>, "meta": { "request_id", "timestamp" } }`
- **Error (4xx/5xx):** Envelope `{ "error": { "code", "message", "details" }, "meta": { "request_id", "timestamp" } }`
- **Codes:** `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `INTERNAL_ERROR`, `UNAUTHORIZED`
- **Do:** `request_id` em toda response (propagado do header `X-Request-ID` ou gerado)
- **Don't:** Expor stack traces ou internals em `details`

### Policy Object (API + Config)

```json
{
  "name": "string (unique, slug)",
  "selector": {
    "path_regex": "string (RE2)",
    "headers": { "X-Custom": "exact|regex:value" },
    "query_params": { "debug": "true" },
    "methods": ["GET", "POST"],
    "probability": 100
  },
  "latency": { "fixed_ms": 0, "min_ms": 100, "max_ms": 500, "jitter": false },
  "error": { "status_code": 500, "body": "{}", "headers": {} },
  "timeout": { "timeout_ms": 5000 },
  "disconnect": {},
  "truncate": { "max_bytes": 1024 },
  "corrupt": { "probability": 0.01, "byte_range": [0, 100] },
  "metadata": { "owner": "team-payments", "ticket": "CHAOS-123" }
}
```
- **Exactly one** action field (latency/error/timeout/disconnect/truncate/corrupt) non-null
- **Do:** Validar no boot + no API apply; rejeitar se 0 ou >1 actions
- **Don't:** Permitir action vazia ("policy pass-through")

### Metrics Naming Convention

- Prefix: `chaosapi_`
- Suffix: `_total` (counter), `_seconds` (histogram), `_bytes` (gauge)
- Labels: `policy` (nome), `action` (latency/error/...), `result` (matched/skipped/error), `status_class` (2xx/3xx/4xx/5xx)
- **Do:** `chaosapi_policy_matches_total{policy="payment-latency",action="latency"}`
- **Don't:** Labels de alta cardinalidade (path, request_id, user_id)

### Log Format (zerolog JSON)

Campos obrigatórios em toda linha:
```json
{
  "level": "info",
  "time": "2026-07-19T10:23:45.123Z",
  "request_id": "req_abc123",
  "method": "POST",
  "path": "/api/v1/payments",
  "policy_matched": "payment-latency",
  "action": "latency",
  "latency_ms": 1247,
  "upstream_status": 200,
  "upstream_latency_ms": 247,
  "proxy_overhead_ms": 3,
  "error": null
}
```
- **Sample rate:** 100% error/warn; 10% info (configurável)
- **Sanitization:** Headers `Authorization`, `Cookie`, `X-API-Key` → `"[REDACTED]"`; body log opt-in com `max_body_log_bytes`

### Health/Readiness Endpoints

- `GET /healthz` → `200 OK` `{ "status": "ok" }` (liveness)
- `GET /readyz` → `200 OK` `{ "status": "ready", "config_hash": "sha256...", "upstream_reachable": true }` (readiness)
- **Do:** `upstream_reachable` = TCP dial + TLS handshake (se HTTPS) < 2s
- **Don't:** Depender de downstream saudável para liveness

### Config File Structure

```yaml
# configs/chaosapi.yaml
server:
  port: 8080
  read_timeout: 30s
  write_timeout: 30s
  idle_timeout: 120s

upstream:
  url: "https://api.example.com"
  timeout: 10s
  tls_skip_verify: false
  max_idle_conns: 100
  max_conns_per_host: 10

policies: []  # array de Policy objects (ver acima)

metrics:
  enabled: true
  port: 9090
  path: "/metrics"

logging:
  level: "info"          # debug, info, warn, error
  format: "json"         # json, console
  sample_rate: 0.1       # 0.0-1.0 para info/debug
  max_body_log_bytes: 4096

admin_api:
  enabled: true
  port: 8081             # porta separada opcional
  api_key: ""            # vazio = desabilitado; set via env CHAOSAPI_ADMIN_API_KEY
  mtls: false            # futuro

hot_reload:
  enabled: true
  signal: "SIGHUP"       # ou "SIGUSR1"
  debounce_ms: 500
```