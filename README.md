# Chaos API

Middleware Node.js (Express/Fastify) que injeta falhas controladas (delay, erro, conexão derrubada, indisponibilidade, resposta malformada/obsoleta) em requisições HTTP, pra validar resiliência de APIs antes de produção. Um `app.use(chaos())` liga a captura; um dashboard separado liga/desliga cenários em tempo real.

## Project structure

```
application/
  src/
    core/              scenario engine + state-store — decide se/como aplicar falha numa request
    adapters/           express.ts, fastify.ts — plugam o core no framework
    scenarios/          delay.ts, error-response.ts, connection-reset.ts, unavailable.ts, malformed-response.ts, stale-response.ts, registry.ts
    dashboard/server/   control-api.ts (control API local, roda no processo do middleware) + index.ts (dashboard-server estático)
    dashboard/ui/       web UI (checkboxes de cenário), fala direto com a control API
    guardrail.ts        bloqueio de cenários quando NODE_ENV=production
    bin/chaos-api.ts    CLI (`chaos-api dashboard`)
  test/                 mirrors src/
docs/                  architecture, design, testing docs (this skill's output)
deployment/            publish pipeline (npm), CI config
scripts/               build/release scripts
```

Status: v2 em andamento — 6 primitivos de cenário (delay, error-response, connection-reset, unavailable, malformed-response, stale-response; nomes v1 aceitos como alias), adapters Express/Fastify, guardrail de produção, control API + dashboard-server + dashboard-ui, 55 testes passando.

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
