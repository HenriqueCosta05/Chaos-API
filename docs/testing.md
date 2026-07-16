# Testing

## Frameworks

- Unit: Vitest — scenario engine (inbound + outbound), primitivos individuais (delay/error-response/connection-reset/unavailable/malformed-response/stale-response), biblioteca de presets, chaos outbound (`createChaosFetch`), feed de atividade (`ActivityLog`), matching de rota/host, guardrail
- Integration: Vitest + Supertest (Express) / `fastify.inject()` (Fastify) — adapters montando app real; Vitest + `fetch` contra `node:http` real pra control API
- E2E: não implementado pro v1 — dashboard-ui (browser) sem cobertura automatizada ainda, verificado manualmente

## Running tests

```bash
cd application
npm test                        # unit + integration, todos os arquivos
npm run test:watch              # watch mode
npx vitest run test/core        # rodar só uma pasta
npx vitest run -t "error-response" # rodar por nome
```

## Test inventory

| Area | Location | Coverage notes |
|---|---|---|
| state-store (registry, matching de rota, validação de rate, alias v1→v2) | `application/test/core/state-store.test.ts` | registro, update, remove, `getActiveForPath` (global + scoped + disabled), glob-to-regex, normalização de tipo legacy (`random-error`/`random-timeout`/`unavailable-503`) |
| scenario-engine (ordem de aplicação, combinação, rate roll, scope) | `application/test/core/scenario-engine.test.ts` | prioridade fixa do `SCENARIO_REGISTRY` (delay antes de error-response), rate hit/miss, scope não-casado passa direto |
| scenario: delay | `application/test/scenarios/delay.test.ts` | minMs, default, range minMs–maxMs |
| scenario: error-response | `application/test/scenarios/error-response.test.ts` | default 500, statusCodes configurável, body/headers customizados, filtro por método HTTP |
| scenario: connection-reset | `application/test/scenarios/connection-reset.test.ts` | termina sem escrever resposta |
| scenario: unavailable | `application/test/scenarios/unavailable.test.ts` | 503 default, statusCode configurável (429/507/...), `Retry-After` quando configurado |
| scenario: malformed-response | `application/test/scenarios/malformed-response.test.ts` | body truncado por ratio, content-type incorreto, garbled JSON default |
| scenario: stale-response | `application/test/scenarios/stale-response.test.ts` | body/status configuráveis, header `X-Chaos-Stale`, `Age` opcional |
| presets: catálogo | `application/test/presets/catalog.test.ts` | nomes únicos, categoria/tipo válidos, todas as 5 categorias do subconjunto v2 cobertas |
| presets: applyPreset/findPreset/listPresets | `application/test/presets/apply-preset.test.ts` | registro via nome de preset, erro em nome desconhecido, override de scope/rate/enabled/options |
| chaos outbound: state-store/engine | `application/test/core/state-store.test.ts`, `application/test/core/scenario-engine.test.ts` | `getActiveOutbound` filtra por host+direção, `getActiveForPath` ignora cenário outbound, `resolveOutbound` aplica/ignora corretamente |
| chaos outbound: createChaosFetch | `application/test/outbound/chaos-fetch.test.ts` | fast-path sem cenário casando, `Response` sintético pra error-response, `throw` pra connection-reset, host não casado passa direto, guardrail em prod |
| activity feed: ActivityLog | `application/test/core/activity-log.test.ts` | ordem newest-first, `limit`, capacidade máxima (drop do mais antigo), `clear` |
| activity feed: engine + control API | `application/test/core/scenario-engine.test.ts`, `application/test/dashboard/control-api.test.ts` | evento gravado só quando o rate roll sobrevive, `GET /api/activity` (lista, `limit`, vazio sem ActivityLog) |
| guardrail (`NODE_ENV=production`) | `application/test/guardrail.test.ts` | bloqueia em prod, warning único, override via `allowInProduction` |
| adapter Express | `application/test/adapters/express.test.ts` | passthrough sem cenário, error-response, scope por rota, unavailable+Retry-After, guardrail em prod |
| adapter Fastify | `application/test/adapters/fastify.test.ts` | mesmos casos do Express via `fastify.inject()` |
| control API (dashboard) | `application/test/dashboard/control-api.test.ts` | CRUD completo (GET/POST/PATCH/DELETE), 404 em id desconhecido, 400 em JSON inválido, CORS preflight |

87 testes, todos passando (`npm test`).

## Known gaps

- Cenário `connection-reset` não é testado fim-a-fim via `fastify.inject()`/Supertest — inject aguardaria a conexão pendurar indefinidamente. Cobertura fica no nível de unidade (scenario-engine + scenario isolado); considerar teste com timeout/race explícito se for adicionar regressão aqui
- `dashboard-ui` (HTML/JS servido em `application/src/dashboard/ui/`) não tem teste automatizado de browser — validado manualmente via smoke test (registrar cenário na control API, checar resposta afetada, checar `/dashboard` servindo)
- Sem load/perf test pro overhead do middleware quando chaos está off (fast-path)
