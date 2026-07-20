# Changelog

Todas as mudanças notáveis deste projeto são documentadas neste arquivo.

O formato é baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e este projeto adere ao [Semantic Versioning](https://semver.org/lang/pt-BR/).

## [1.2.0]

### Added

- A correspondência por probabilidade dos seletores agora amostra requisições corretamente em vez de tratar políticas com valor diferente de 100% como stub
- Scripts de inicialização e publicação adicionados em `scripts/bootstrap` e `scripts/publish`, com suporte para preparar o ambiente local, gerar binário e empacotar artefatos de distribuição
- Dockerfile e docker-compose alinhados com a estrutura real do projeto em `application/`, com caminhos de configuração corrigidos e sem dependências de arquivos de provisionamento inexistentes

### Fixed

- Admin API (CRUD de políticas) estava efetivamente quebrada: `cmd/chaosapi/main.go` montava um router próprio e morto (`createAdminRouter`) cujo `writeJSON`/`writeError` nunca escreviam corpo de resposta e `readJSON` sempre retornava `nil`, então `POST`/`PUT /admin/policies` nunca liam o body e nenhuma alteração chegava a afetar o proxy. Substituído pelo `internal/admin.AdminServer` (já existente e funcional, mas não usado), agora conectado ao `policy.Engine` em tempo real e sincronizado com o reload por `SIGHUP`

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