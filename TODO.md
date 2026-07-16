# TODO

Live backlog. Remove items when done — this is not a changelog.

## Now

- [ ] Publicar `@henriquecosta/chaos-api@0.1.0` no npm (ver `deployment/README.md`)
- [ ] README do pacote (`application/README.md`) com exemplo de uso standalone, hoje só existe no root

## Next

- [ ] Persistência de config (arquivo local / import-export de cenário)
- [x] Respostas inválidas (payload malformado, schema quebrado) — primitivo `malformed-response` (docs/PRD.md 6.2)
- [x] Chaos outbound — `createChaosFetch(store)`, escopo por host via `direction: "outbound"` (docs/PRD.md 6.4)
- [x] Biblioteca de presets (docs/PRD.md 6.3) — subconjunto HTTP-simulável (segurança, dependências externas, configuração, resource exhaustion, filesystem), 21 presets em `application/src/presets/`; categorias restantes ficam pra depois (dependem de chaos outbound ou de design de preset composto)
- [x] Dashboard v2 — feed de atividade (docs/PRD.md 6.5) — `ActivityLog` em memória, `GET /api/activity`, polling de 3s na UI
- [ ] Dashboard v2 — biblioteca de presets navegável na UI, runner de requisição de teste, import/export de config (docs/PRD.md 6.5)
- [ ] CLI pra rodar cenários headless em CI
- [ ] Teste E2E de browser pro dashboard-ui (hoje só validado manualmente)

## Later / ideas

- [ ] Suporte a mais frameworks (NestJS, Koa, Hapi)
- [ ] Métricas/export (Prometheus, OpenTelemetry)
- [ ] Auth no dashboard + multi-projeto
- [ ] Chaos scenarios como código versionado (chaos-as-config em YAML)
- [ ] Modo distribuído (múltiplos serviços coordenados)

## Known issues

- Cenário `connection-reset` não tem teste fim-a-fim (via `fastify.inject`/Supertest) — ver `docs/testing.md` "Known gaps"
- `npm audit` acusa vulnerabilidades em devDependencies (Vitest/esbuild) — não afeta o pacote publicado (`dist/` só depende de Node runtime), mas vale rodar `npm audit fix` antes de configurar CI
