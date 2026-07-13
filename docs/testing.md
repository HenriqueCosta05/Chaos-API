# Testing

## Frameworks

- Unit: Vitest — scenario engine, cenários individuais (delay/random-error/timeout/503), matching de rota, guardrail
- Integration: Vitest + Supertest (Express) / `fastify.inject()` (Fastify) — adapters montando app real; Vitest + `fetch` contra `node:http` real pra control API
- E2E: não implementado pro v1 — dashboard-ui (browser) sem cobertura automatizada ainda, verificado manualmente

## Running tests

```bash
cd application
npm test                        # unit + integration, todos os arquivos
npm run test:watch              # watch mode
npx vitest run test/core        # rodar só uma pasta
npx vitest run -t "random-error" # rodar por nome
```

## Test inventory

| Area | Location | Coverage notes |
|---|---|---|
| state-store (registry, matching de rota, validação de rate) | `application/test/core/state-store.test.ts` | registro, update, remove, `getActiveForPath` (global + scoped + disabled), glob-to-regex |
| scenario-engine (ordem de aplicação, combinação, rate roll, scope) | `application/test/core/scenario-engine.test.ts` | prioridade fixa (delay antes de random-error), rate hit/miss, scope não-casado passa direto |
| scenario: delay | `application/test/scenarios/delay.test.ts` | minMs, default, range minMs–maxMs |
| scenario: random-error | `application/test/scenarios/random-error.test.ts` | default 500, statusCodes configurável, body customizado |
| scenario: random-timeout | `application/test/scenarios/random-timeout.test.ts` | termina sem escrever resposta |
| scenario: unavailable-503 | `application/test/scenarios/unavailable-503.test.ts` | 503 default, `Retry-After` quando configurado |
| guardrail (`NODE_ENV=production`) | `application/test/guardrail.test.ts` | bloqueia em prod, warning único, override via `allowInProduction` |
| adapter Express | `application/test/adapters/express.test.ts` | passthrough sem cenário, random-error, scope por rota, 503+Retry-After, guardrail em prod |
| adapter Fastify | `application/test/adapters/fastify.test.ts` | mesmos casos do Express via `fastify.inject()` |
| control API (dashboard) | `application/test/dashboard/control-api.test.ts` | CRUD completo (GET/POST/PATCH/DELETE), 404 em id desconhecido, 400 em JSON inválido, CORS preflight |

44 testes, todos passando (`npm test`).

## Known gaps

- Cenário `random-timeout` não é testado fim-a-fim via `fastify.inject()`/Supertest — inject aguardaria a conexão pendurar indefinidamente. Cobertura fica no nível de unidade (scenario-engine + scenario isolado); considerar teste com timeout/race explícito se for adicionar regressão aqui
- `dashboard-ui` (HTML/JS servido em `application/src/dashboard/ui/`) não tem teste automatizado de browser — validado manualmente via smoke test (registrar cenário na control API, checar resposta afetada, checar `/dashboard` servindo)
- Sem load/perf test pro overhead do middleware quando chaos está off (fast-path)
