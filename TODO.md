# TODO

Live backlog. Remove items when done — this is not a changelog.

## Now

- [ ] Publicar `@henriquecosta/chaos-api@0.1.0` no npm (ver `deployment/README.md`)
- [ ] README do pacote (`application/README.md`) com exemplo de uso standalone, hoje só existe no root

## Next

- [x] Import/export de config (docs/PRD.md 6.5) — `GET`/`POST /api/config`, botões Exportar/Importar no dashboard; persistência entre restarts do processo continua fora de escopo (fica pro import/export manual, mesma decisão do v1)
- [x] Respostas inválidas (payload malformado, schema quebrado) — primitivo `malformed-response` (docs/PRD.md 6.2)
- [x] Chaos outbound — `createChaosFetch(store)`, escopo por host via `direction: "outbound"` (docs/PRD.md 6.4)
- [x] Biblioteca de presets (docs/PRD.md 6.3) — subconjunto HTTP-simulável (segurança, dependências externas, configuração, resource exhaustion, filesystem), 21 presets em `application/src/presets/`; categorias restantes ficam pra depois (dependem de chaos outbound ou de design de preset composto)
- [x] Dashboard v2 — feed de atividade (docs/PRD.md 6.5) — `ActivityLog` em memória, `GET /api/activity`, polling de 3s na UI
- [x] Dashboard v2 — biblioteca de presets navegável na UI (docs/PRD.md 6.5) — `GET /api/presets` (+ filtro categoria), `POST /api/presets/:name/apply`, cards com botão "Aplicar" no dashboard
- [x] Dashboard v2 — runner de requisição de teste (docs/PRD.md 6.5) — fetch direto do browser (método/URL/headers/body), sem passar pela control API; sujeito a CORS da app-alvo
- [x] Adapter NestJS (docs/PRD.md 6.6) — `createChaosNestMiddleware()`, middleware funcional sem depender de `@nestjs/common`
- [ ] Adapter Koa (docs/PRD.md 6.6)
- [ ] CLI pra rodar cenários headless em CI
- [ ] Teste E2E de browser pro dashboard-ui (hoje só validado manualmente)

## Later / ideas

- [ ] Suporte a Hapi (docs/PRD.md 6.6 mantém em Later)
- [ ] Métricas/export (Prometheus, OpenTelemetry)
- [ ] Auth no dashboard + multi-projeto
- [ ] Chaos scenarios como código versionado (chaos-as-config em YAML)
- [ ] Modo distribuído (múltiplos serviços coordenados)

## Known issues

- Cenário `connection-reset` não tem teste fim-a-fim (via `fastify.inject`/Supertest) — ver `docs/testing.md` "Known gaps"
- `npm audit` acusa vulnerabilidades em devDependencies (Vitest/esbuild) — não afeta o pacote publicado (`dist/` só depende de Node runtime), mas vale rodar `npm audit fix` antes de configurar CI
