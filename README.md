# Chaos API

Middleware Node.js (Express/Fastify) que injeta falhas controladas (delay, erro, conexão derrubada, indisponibilidade, resposta malformada/obsoleta) em requisições HTTP, pra validar resiliência de APIs antes de produção. Um `app.use(chaos())` liga a captura; um dashboard separado liga/desliga cenários em tempo real.

## Project structure

```
application/
  src/
    core/              scenario engine + state-store + activity-log — decide se/como aplicar falha numa request e registra o feed de atividade (docs/PRD.md 6.5)
    adapters/           express.ts, fastify.ts, nestjs.ts, koa.ts — plugam o core no framework
    scenarios/          delay.ts, error-response.ts, connection-reset.ts, unavailable.ts, malformed-response.ts, stale-response.ts, registry.ts
    presets/            biblioteca de presets (docs/PRD.md 6.3) — catálogo de falhas nomeadas que resolvem pra {primitivo, options, scope}
    outbound/           chaos outbound (docs/PRD.md 6.4) — createChaosFetch(store), wrapper de fetch com escopo por host de destino
    dashboard/server/   control-api.ts (control API local, roda no processo do middleware) + index.ts (dashboard-server estático)
    dashboard/ui/       web UI (checkboxes de cenário), fala direto com a control API
    guardrail.ts        bloqueio de cenários quando NODE_ENV=production
    bin/chaos-api.ts    CLI (`chaos-api dashboard`)
  test/                 mirrors src/
docs/                  architecture, design, testing docs (this skill's output)
deployment/            publish pipeline (npm), CI config
scripts/               build/release scripts
```

Status: v2 em andamento — 6 primitivos de cenário (delay, error-response, connection-reset, unavailable, malformed-response, stale-response; nomes v1 aceitos como alias), biblioteca de presets (21 falhas nomeadas em 5 categorias: segurança, dependências externas, configuração, resource exhaustion, filesystem) navegável no dashboard e aplicável com um clique, chaos outbound (`createChaosFetch`, escopo por host de destino), feed de atividade (`GET /api/activity`, polling na UI), import/export de config (`GET`/`POST /api/config`, botões Exportar/Importar no dashboard), runner de requisição de teste no dashboard, adapters Express/Fastify/NestJS/Koa, guardrail de produção, control API + dashboard-server + dashboard-ui, 106 testes passando.

## Quick start

```bash
cd application
npm install
npm test                          # unit + integration (Vitest)
npm run build                     # compila pra dist/
npx tsx src/bin/chaos-api.ts dashboard   # sobe dashboard-ui (:4000) + control API demo (:51820)
```

Por padrão `chaos-api dashboard` sobe os dois processos que a UI precisa: o dashboard-ui estático e uma control API standalone (StateStore isolado, só pra testar a UI sem escrever uma app). Pra ligar numa app real, use `chaos({ controlPort })` na própria app (que abre a control API real, conectada ao tráfego dela) e suba o dashboard só com a UI:

```bash
npx tsx src/bin/chaos-api.ts dashboard --no-control-api   # sua app já abre a control API
```

Uso na sua app:

```ts
import express from "express";
import { chaos } from "@henriquecosta/chaos-api";

const app = express();
app.use(chaos({ controlPort: 51820 })); // abre a control API local pro dashboard
```

Pra ativar uma falha do catálogo (docs/PRD.md 6.3) sem montar `{type, options}` na mão:

```ts
import { StateStore, applyPreset } from "@henriquecosta/chaos-api";

const store = new StateStore();
applyPreset(store, "third-party-timeout", { scope: { pattern: "/checkout/*" } });
```

Em NestJS (functional middleware, funciona em platform-express ou platform-fastify):

```ts
import { createChaosNestMiddleware } from "@henriquecosta/chaos-api";

export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(createChaosNestMiddleware({ controlPort: 51820 })).forRoutes("*");
  }
}
```

Em Koa:

```ts
import Koa from "koa";
import { chaosKoaMiddleware } from "@henriquecosta/chaos-api";

const app = new Koa();
app.use(chaosKoaMiddleware({ controlPort: 51820 }));
```

Pra simular uma dependência externa caindo (docs/PRD.md 6.4), troque `fetch` por `createChaosFetch`:

```ts
import { StateStore, createChaosFetch } from "@henriquecosta/chaos-api";

const store = new StateStore();
store.register({ type: "unavailable", direction: "outbound", scope: { pattern: "api.stripe.com" } });

const chaosFetch = createChaosFetch(store);
await chaosFetch("https://api.stripe.com/v1/charges"); // 503 sintético, não chega na rede
```

## Prerequisites

- Node.js >= 18
- TypeScript
- Sem dependências externas obrigatórias (Postgres, filas etc.) — ferramenta roda 100% local

## Where to look next

- Product requirements: [docs/PRD.md](docs/PRD.md)
- Architecture and design decisions: [docs/architecture-and-walkthrough.md](docs/architecture-and-walkthrough.md)
- UI/branding spec (dashboard): [docs/DESIGN.md](docs/DESIGN.md)
- Testing: [docs/testing.md](docs/testing.md)
- Deployment (npm publish): [deployment/README.md](deployment/README.md)
