# TODO

Live backlog. Remove items when done — this is not a changelog.

## Now

- [ ] Publicar `@henriquecosta/chaos-api@0.1.0` no npm (ver `deployment/README.md`)
- [ ] README do pacote (`application/README.md`) com exemplo de uso standalone, hoje só existe no root

## Next

- [ ] Persistência de config (arquivo local / import-export de cenário)
- [x] Respostas inválidas (payload malformado, schema quebrado) — primitivo `malformed-response` (docs/PRD.md 6.2)
- [ ] Chaos outbound — indisponibilidade/erro/delay em chamadas de saída (dependência específica down, não a API toda; ver docs/PRD.md 6.4)
- [ ] Biblioteca de presets (docs/PRD.md 6.3) — catálogo de nomes de falha apontando pra `{primitivo, options, scope}`, ainda não existe camada de preset em cima dos 6 primitivos
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
