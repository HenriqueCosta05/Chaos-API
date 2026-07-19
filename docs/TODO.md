# TODO — ChaosAPI

Live backlog. Remove items when done — this is not a changelog.

## Now

- [ ] Scaffold Go module + estrutura de pastas `application/` + Makefile
- [ ] Config loading: YAML + env var overrides + validação (R-13)
- [ ] Health endpoints `/healthz` `/readyz` (R-12)

## Next

- [ ] Proxy HTTP pass-through básico (R-01) — `net/http/httputil.ReverseProxy` customizado
- [ ] WebSocket upgrade support (R-01)
- [ ] Policy actions: latency (fixed + random uniform) (R-02)
- [ ] Policy actions: error HTTP status + body (R-03)
- [ ] Policy actions: timeout (close after N ms) (R-04)
- [ ] Policy actions: disconnect (TCP RST) (R-05)
- [ ] Admin API REST: CRUD policies (R-09)
- [ ] Hot-reload config (file watch + SIGHUP + API reload) (R-10)

## Later / ideas

- [ ] Policy actions: truncate response body (R-06)
- [ ] Policy actions: corrupt bytes (R-07)
- [ ] Prometheus metrics: requests, overhead, matches, errors (R-11)
- [ ] Structured JSON logging + request ID correlation (R-15)
- [ ] Docker multi-arch build + goreleaser config (R-14)
- [ ] Config examples em `configs/` (dev, staging, CI)
- [ ] Integration tests com downstream mock (httptest)
- [ ] CI: lint, test, build, docker build, security scan (gosec, govulncheck)
- [ ] README quickstart + exemplos de policies
- [ ] CHANGELOG v1.0.0 release

## Known issues

- [ ] Go stdlib `ReverseProxy` não expõe hook para TCP RST fácil — pode precisar `net.Conn` raw ou `golang.org/x/net/http2` para disconnect policy (R-05)
- [ ] WebSocket proxy com modificação de frames (latency/error) requer interceptar `Hijack` — complexidade alta, avaliar se v1.0 ou v1.1
- [ ] Hot-reload concorrente com requests in-flight: garantir atomic swap do policy engine sem drop de conexões