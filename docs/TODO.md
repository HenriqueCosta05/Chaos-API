# TODO — ChaosAPI

Live backlog. Remove items when done — this is not a changelog.

## Done (verified in code)

- [x] Go module + `application/` estrutura + Makefile
- [x] Config loading: YAML + env var overrides + validação (R-13)
- [x] Health endpoints `/healthz` `/readyz` (R-12) — `/readyz` agora escreve o body JSON (era `w.WriteHeader` sem `json.Encode`, commentado)
- [x] Proxy HTTP pass-through (R-01) — `httputil.ReverseProxy` custom
- [x] WebSocket upgrade support (R-01)
- [x] Policy actions: latency, error, timeout, disconnect, truncate, corrupt (R-02..R-07)
- [x] Seletores: path regex, header, query param, method, probability (R-08) — probability sem valor explícito (zero value) agora casa sempre, igual aos outros campos do seletor, em vez de nunca casar
- [x] Prometheus metrics (R-11)
- [x] Structured JSON logging + request ID (R-15)
- [x] Hot-reload via SIGHUP (R-10)
- [x] Admin API CRUD (R-09) — corrigido em sessão anterior (trocado `createAdminRouter` morto por `internal/admin.AdminServer` real); testado fim-a-fim nesta sessão com testes de integração reais
- [x] `--validate-config` flag: parse + validate sem subir servidor
- [x] Exit codes distintos por classe de erro (config=2, upstream=3, proxy-init=4, bind=5) em vez de `log.Fatal` genérico (sempre 1)
- [x] Shutdown do metrics server loga erro em vez de descartar
- [x] `/admin/reload` (API) = sync memória→engine; `SIGHUP` = disco→engine+admin. Documentado explicitamente no README
- [x] `.gitignore` adicionado; `application/bin/*` e `application/configs/chaosapi.yaml` untracked (binário e config local não devem ser commitados)
- [x] Sanitização de headers sensíveis (`Authorization`, `Cookie`, `X-API-Key`, etc.) wireada em log de debug + testes (RK-02)
- [x] Integration tests: policy engine (unit), proxy (httptest end-to-end por action), admin API (CRUD completo + auth), config (load/validate/env override)
- [x] CI: GitHub Actions com build+vet+test (blocking), build-smoke com `-validate-config`, docker multi-arch build via buildx (blocking, sem push), lint (`golangci-lint`) e security scan (`gosec`, `govulncheck`) como advisory até triagem
- [x] Benchmark de overhead (`BenchmarkProxy_PassthroughOverhead`, `make bench`) — harness existe e reporta p50/p95/p99; guard RK-01 (p99 < 5ms) precisa ser validado em ambiente de CI/prod real, não em máquina de dev
- [x] WebSocket frame-level chaos (latency/corrupt por mensagem): decisão registrada em [ADR-005](adr/005-defer-websocket-frame-chaos.md) — deferido para v1.1, documentado no README como limitação conhecida

## Bugs corrigidos nesta sessão (via cobertura de teste)

Encontrados escrevendo os testes de integração acima — nenhum estava coberto por teste antes:

- `internal/health`: `/readyz` nunca escrevia body (linha comentada)
- `pkg/models`: `Selector.Probability` no zero-value nunca casava (deveria sempre casar, como os outros campos do seletor) — quebrava silenciosamente qualquer policy sem `probability` explícito no YAML (ex: `list-truncate`, `upload-corrupt` no config de exemplo)
- `internal/proxy`: com métricas desabilitadas (`metrics.enabled: false`), qualquer policy match causava panic (nil pointer) porque o código acessava campos Prometheus crus em vez dos wrappers nil-safe do pacote `metrics`
- `internal/policy`: `truncateWriter.Write` violava o contrato de `io.Writer` (retornava `n < len(input)` com `err == nil`), fazendo `httputil.ReverseProxy` abortar o streaming da resposta (`io.ErrShortWrite`) — cliente via `EOF` em vez do body truncado
- `internal/config`: overrides de env var para campos `time.Duration` e `float64` eram no-ops silenciosos (bug de `reflect.Kind` — `Duration` é `Kind() == Int64`, não `Struct`; não havia case pra `Float64`)
- `application/Makefile`: paths assumiam cwd = raiz do repo, mas o uso documentado é `make -C application <target>` (cwd = `application/`) — quase todo target quebrado
- `deployment/Dockerfile`, `deployment/docker-compose.yml`, `application/Makefile`: referenciavam `deployments/` (plural) — diretório real é `deployment/` (singular)
- `deployment/Dockerfile`: builder `golang:1.22-alpine` não compila `go.mod` com `go 1.26.4`; `COPY` do config de exemplo apontava pro path errado (faltava `examples/`)

## Now — fechar buracos de execução/CLI

- [ ] `admin_api.port` no config é validado (não pode == `server.port`) mas nunca usado — Admin API é montada no router principal (`server.Port`), não sobe listener próprio. Decidir: (a) implementar listener separado em `admin_api.port` para isolamento de rede, ou (b) remover o campo/validação morta e documentar que Admin API sempre compartilha a porta principal. Candidato a ADR
- [ ] Tirar `continue-on-error` dos jobs `lint` e `security` no CI depois de triagem: rodar `golangci-lint run` e `gosec`/`govulncheck` localmente, corrigir achados, promover a gate bloqueante

## Next — completar MVP (v1.0 conforme PRD M1-M4)

- [ ] Confirmar build multi-arch do Docker rodando de fato até completar (CI builda via buildx nesta sessão, mas não foi executado localmente — ambiente sem Docker disponível). Verificar tamanho da imagem final < 20MB (R-14)
- [ ] Rodar `make bench` / `go test -bench` em ambiente de CI/prod representativo e registrar p99 real contra a meta RK-01 (< 5ms) — o harness existe, falta o número de referência
- [ ] Testes de integração de WebSocket (bridge passthrough) — pré-requisito definido na ADR-005 antes de implementar chaos por frame em v1.1
- [ ] CHANGELOG: fechar versão quando M1-M4 do PRD estiverem 100% concluídos

## Known issues

- [x] ~~Go stdlib `ReverseProxy` não expõe hook fácil pra TCP RST~~ — resolvido via `http.Hijacker` + `SetLinger(0)` em `proxy.go:hijackDisconnect`
- WebSocket chaos por frame (latency/corrupt) — deferido para v1.1, ver [ADR-005](adr/005-defer-websocket-frame-chaos.md)
- [x] ~~Hot-reload concorrente com requests in-flight~~ — `policy.Engine.SetPolicies` faz swap atômico sob `sync.RWMutex`, seguro
