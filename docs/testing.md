# Testing

Status: pré-implementação — nenhum teste escrito ainda. Este doc define a estratégia planejada; atualizar conforme código for escrito.

## Frameworks

- Unit: Vitest — scenario engine, cenários individuais (delay/random-error/timeout/503), matching de rota
- Integration: Vitest + Supertest — adapter Express e adapter Fastify, montando app real e verificando comportamento fim-a-fim do middleware
- E2E: não planejado pro v1 — dashboard-server/dashboard-ui cobertos por integration tests da control API; sem E2E de browser em v1

## Running tests

```bash
npm test                        # unit, todos os pacotes
npm run test:integration        # adapters Express/Fastify, control API do dashboard
npm test -- scenario-engine     # single-file/pattern match
npm test -- --watch
```

## Test inventory

| Area | Location | Coverage notes |
|---|---|---|
| scenario-engine | `application/test/core/scenario-engine.test.ts` | não implementado ainda — cobrir matching de rota, combinação de cenários, % de requisições |
| scenarios (delay/random-error/timeout/503) | `application/test/scenarios/` | não implementado ainda |
| adapter Express | `application/test/adapters/express.test.ts` | não implementado ainda — usar Supertest contra app Express real |
| adapter Fastify | `application/test/adapters/fastify.test.ts` | não implementado ainda — usar `fastify.inject()` |
| dashboard control API | `application/test/dashboard-server/` | não implementado ainda — cobrir liga/desliga cenário via API, propagação pro state-store |
| guardrail `NODE_ENV=production` | `application/test/core/` | não implementado ainda — caso crítico de segurança, priorizar |

## Known gaps

- Nenhum teste existe ainda — projeto em fase de PRD/docs, código não escrito
- Sem plano de load/perf test pro overhead do middleware quando chaos está off (fast-path) — avaliar depois que core existir
