# TODO

Live backlog. Remove items when done — this is not a changelog.

## Now (v1 — MVP)

- [ ] Scaffold `application/` — TypeScript project, build config, npm package `@henriquecosta/chaos-api`
- [ ] Scenario engine core: registry, per-route matching (glob/regex), % de requisições afetadas
- [ ] Suporte a cenários combináveis (delay + random-error na mesma rota, aplicados em sequência)
- [ ] Cenário: Delay (fixo ou range)
- [ ] Cenário: Random Errors (4xx/5xx configurável)
- [ ] Cenário: Random Timeout
- [ ] Cenário: HTTP 503 (com/sem `Retry-After`)
- [ ] Adapter Express
- [ ] Adapter Fastify
- [ ] Guardrail: warning/bloqueio se `NODE_ENV=production` (flag pra override explícito)
- [ ] `dashboard-server`: processo separado, control API local (HTTP/WS) falando com o middleware
- [ ] `dashboard-ui`: UI com checkboxes por cenário/rota, consumindo control API
- [ ] Config programática (`chaos({ scenarios: [...] })`) pra uso em CI/testes automatizados

## Next

- [ ] Persistência de config (arquivo local / import-export de cenário)
- [ ] Respostas inválidas (payload malformado, schema quebrado)
- [ ] Indisponibilidade parcial (dependência específica down, não a API toda)
- [ ] CLI pra rodar cenários headless em CI

## Later / ideas

- [ ] Suporte a mais frameworks (NestJS, Koa, Hapi)
- [ ] Métricas/export (Prometheus, OpenTelemetry)
- [ ] Auth no dashboard + multi-projeto
- [ ] Chaos scenarios como código versionado (chaos-as-config em YAML)
- [ ] Modo distribuído (múltiplos serviços coordenados)

## Known issues

- Nenhum ainda — projeto pré-implementação.
