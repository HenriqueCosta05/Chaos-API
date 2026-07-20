# TODO — ChaosAPI

Live backlog. Remove items when done — this is not a changelog.

## Done (verified in code, was stale in this file)

- [x] Go module + `application/` estrutura + Makefile
- [x] Config loading: YAML + env var overrides + validação (R-13)
- [x] Health endpoints `/healthz` `/readyz` (R-12)
- [x] Proxy HTTP pass-through (R-01) — `httputil.ReverseProxy` custom
- [x] WebSocket upgrade support (R-01)
- [x] Policy actions: latency, error, timeout, disconnect, truncate, corrupt (R-02..R-07)
- [x] Seletores: path regex, header, query param, method, probability (R-08)
- [x] Prometheus metrics (R-11)
- [x] Structured JSON logging + request ID (R-15)
- [x] Hot-reload via SIGHUP (R-10)
- [x] Admin API CRUD (R-09) — **era stub quebrado**, corrigido nesta sessão: `main.go` montava um `createAdminRouter` local morto cujo `writeJSON`/`writeError` nunca escreviam body e `readJSON` sempre retornava `nil` (POST/PUT nunca liam o body, engine nunca era atualizada). Trocado para usar `internal/admin.AdminServer` real; CRUD agora propaga pro `policy.Engine` via `reloadFn`, e o reload por SIGHUP sincroniza o `AdminServer` também.

## Now — fechar buracos de execução/CLI

- [ ] Testar fluxo completo do Admin API fim-a-fim (create → engine aplica → get → update → delete) manualmente ou com teste de integração — nunca foi exercitado de verdade por estar quebrado
- [ ] `--validate-config` flag / subcomando: parse + validate sem subir servidor (útil pra CI e pre-flight antes de deploy)
- [ ] Exit codes distintos por classe de erro (config inválida vs upstream inválido vs bind falhou) em vez de `log.Fatal` genérico — ajuda script de deploy a diferenciar causa
- [ ] `metricsServer` e admin server não têm shutdown com timeout tratado (erro do `Shutdown` é descartado silenciosamente) — logar erro de shutdown do metrics server
- [ ] Endpoint `/admin/reload` hoje reaplica as políticas em memória do `AdminServer` pro engine — não relê o YAML do disco. Decidir e documentar: reload via API = sync memória→engine; reload via SIGHUP = disco→engine+admin. Deixar isso explícito no README pra não confundir operador
- [ ] `.gitignore` ausente no repo — `application/bin/` (binário compilado) e `application/configs/chaosapi.yaml` (config local) aparecem como untracked; adicionar antes que alguém commit acidental um binário

## Next — completar MVP (v1.0 conforme PRD M1-M4)

- [ ] Integration tests com downstream mock (`httptest`) cobrindo cada policy action (latency/error/timeout/disconnect/truncate/corrupt) e o Admin API CRUD real
- [ ] Teste de WebSocket: `copyWebSocket` em `proxy.go` tem os hooks de `latency`/`corrupt` por policy comentados como no-op — política de latência/corrupt não afeta frames WS hoje, só HTTP. Decidir se entra no v1.0 (RK do PRD já sinalizava alta complexidade) ou fica p/ v1.1
- [ ] CI: lint (`golangci-lint`), test, build, docker build, security scan (`gosec`, `govulncheck`)
- [ ] Docker multi-arch build (amd64/arm64) — `deployment/Dockerfile` foi atualizado mas falta confirmar build multi-arch (R-14, meta < 20MB)
- [ ] README quickstart + exemplos de policies usando `application/configs/examples/chaosapi.yaml.example`
- [ ] Benchmark de overhead p99 < 5ms (RK-01 do PRD) — nenhum benchmark existe ainda, é métrica de guarda do PRD
- [ ] Sanitização de headers sensíveis em log (`Authorization`, `Cookie`, `X-API-Key`) — checar `internal/logging` se já filtra; PRD marca isso como requisito de segurança (RK-02)
- [ ] CHANGELOG v1.0.0 release quando M1-M4 fecharem

## Known issues

- [x] ~~Go stdlib `ReverseProxy` não expõe hook fácil pra TCP RST~~ — resolvido via `http.Hijacker` + `SetLinger(0)` em `proxy.go:hijackDisconnect`
- [ ] WebSocket proxy com modificação de frames (latency/corrupt) requer interceptar mensagem a mensagem — placeholder existe em `copyWebSocket`, não implementado (ver item Next acima)
- [x] ~~Hot-reload concorrente com requests in-flight~~ — `policy.Engine.SetPolicies` faz swap atômico sob `sync.RWMutex`, seguro
