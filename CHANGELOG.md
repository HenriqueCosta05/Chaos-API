# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.2.0]

### Added

- A correspondência por probabilidade dos seletores agora amostra requisições corretamente em vez de tratar políticas com valor diferente de 100% como stub
- Scripts de inicialização e publicação adicionados em `scripts/bootstrap` e `scripts/publish`, com suporte para preparar o ambiente local, gerar binário e empacotar artefatos de distribuição
- Dockerfile e docker-compose alinhados com a estrutura real do projeto em `application/`, com caminhos de configuração corrigidos e sem dependências de arquivos de provisionamento inexistentes
- Flag `--validate-config`: parseia e valida o arquivo de config e sai sem subir o servidor (uso em CI / pre-flight de deploy)
- Exit codes distintos por classe de erro (`2`=config inválida, `3`=upstream inválido, `4`=falha ao iniciar o proxy, `5`=falha de bind) em vez de sempre sair com `1`
- `.gitignore` adicionado; `application/bin/*` (binários compilados) e `application/configs/chaosapi.yaml` (config local) deixaram de ser versionados
- Sanitização de headers sensíveis (`Authorization`, `Cookie`, `X-API-Key`, `X-Auth-Token`, `Proxy-Authorization`) agora é aplicada de fato em log de nível debug, com testes cobrindo o comportamento (RK-02 do PRD)
- Suite de testes de integração/unitários: `internal/policy` (seletores + ações), `internal/proxy` (fim-a-fim por policy action via `httptest`), `internal/admin` (CRUD completo + auth), `internal/config` (load/validate/env override)
- Benchmark `BenchmarkProxy_PassthroughOverhead` (`make bench`) reportando p50/p95/p99 de overhead sem policy ativa, medindo contra a meta RK-01 do PRD (p99 < 5ms)
- Pipeline de CI (GitHub Actions): build+vet+test com race detector e build-smoke validando `--validate-config` contra o config de exemplo (bloqueantes); build multi-arch (amd64/arm64) via `docker buildx` sem push (bloqueante); `golangci-lint`, `gosec` e `govulncheck` como jobs advisory até triagem completa do codebase
- Documentação do comportamento de reload no README: `POST /admin/reload` (e CRUD via `/admin/policies`) sincroniza memória→engine; `SIGHUP` relê o arquivo YAML do disco e sincroniza disco→engine+admin — mudanças via API não persistem no arquivo
- [ADR-005](docs/adr/005-defer-websocket-frame-chaos.md): decisão formal de deferir chaos por frame (`latency`/`corrupt`) em conexões WebSocket para v1.1, documentada no README como limitação conhecida

### Fixed

- Admin API (CRUD de políticas) estava efetivamente quebrada: `cmd/chaosapi/main.go` montava um router próprio e morto (`createAdminRouter`) cujo `writeJSON`/`writeError` nunca escreviam corpo de resposta e `readJSON` sempre retornava `nil`, então `POST`/`PUT /admin/policies` nunca liam o body e nenhuma alteração chegava a afetar o proxy. Substituído pelo `internal/admin.AdminServer` (já existente e funcional, mas não usado), agora conectado ao `policy.Engine` em tempo real e sincronizado com o reload por `SIGHUP`
- `/readyz` retornava sempre um body vazio: o `json.NewEncoder(w).Encode(resp)` estava comentado, então só o status code chegava ao cliente
- `Selector.Probability` no zero-value (campo `probability` omitido no YAML) nunca casava — ao contrário de todo outro campo do seletor, que casa tudo quando vazio. Duas policies do config de exemplo (`list-truncate`, `upload-corrupt`) dependiam desse omitido e nunca disparavam
- Com métricas desabilitadas (`metrics.enabled: false`), qualquer policy match causava `panic` (nil pointer dereference): o proxy acessava campos Prometheus (`PolicyMatchesTotal`, `RequestDuration`, etc.) diretamente em vez dos wrappers nil-safe do pacote `metrics`, guardados só por um `if p.metrics != nil` que nunca protegia os campos internos
- `truncateWriter.Write` violava o contrato de `io.Writer` (retornava menos bytes que o recebido com `err == nil`), fazendo `httputil.ReverseProxy` abortar o streaming da resposta com `io.ErrShortWrite` — clientes viam `EOF` em vez do body truncado
- Overrides de variável de ambiente para campos `time.Duration` (ex: `CHAOSAPI_UPSTREAM_TIMEOUT`) e `float64` (`CHAOSAPI_LOG_SAMPLE_RATE`) eram no-ops silenciosos por um bug de `reflect.Kind` no loader de config
- `application/Makefile`: quase todo target (`build`, `test`, `lint`, `vet`, `fmt`, `cover`) usava paths assumindo cwd = raiz do repo, mas o uso documentado (`make -C application <target>`) roda com cwd = `application/`
- `deployment/Dockerfile`, `deployment/docker-compose.yml` e `application/Makefile` referenciavam o diretório `deployments/` (plural); o diretório real é `deployment/` (singular) — build Docker e `docker-compose` estavam quebrados
- `deployment/Dockerfile`: imagem builder `golang:1.22-alpine` não compila contra `go.mod` (`go 1.26.4`); `COPY` do config de exemplo apontava para `configs/chaosapi.yaml.example` em vez de `configs/examples/chaosapi.yaml.example`
- Shutdown do metrics server descartava o erro retornado por `Shutdown(ctx)` silenciosamente; agora é logado

## [1.1.0] - 2026-07-19

### Added

- Documentação inicial: PRD, CONVENTIONS, DESIGN, README, TODO, CHANGELOG
- Base funcional do ChaosAPI em Go com `application/`, entrypoint em `cmd/chaosapi` e pacotes internos para `config`, `policy`, `proxy`, `health`, `metrics`, `logging` e `admin`
- Carregamento de configuração via YAML com overrides por variáveis de ambiente, valores padrão e validação de portas, upstream, políticas, métricas, admin API e hot-reload
- Proxy reverso com suporte a WebSocket e ações de caos implementadas: `latency`, `error`, `timeout`, `disconnect`, `truncate` e `corrupt`
- Engine de políticas com seletores por path regex, headers exatos/regex, query params, método HTTP e probabilidade, além de troca atômica de políticas em memória
- Endpoints de health/readiness, métricas Prometheus, logging estruturado com `zerolog` e middleware de request ID/correlation
- Admin API com CRUD de políticas, autenticação opcional por `X-API-Key` e endpoint de reload de configuração
- Artefatos de execução adicionados para deploy local e observabilidade, incluindo Docker, docker-compose, Prometheus e exemplo de configuração em `configs/`

---

## [1.0.0] - 2026-07-19

### Added

- Estrutura inicial do projeto ChaosAPI
- Seis documentos de documentação núcleo criados a partir dos templates