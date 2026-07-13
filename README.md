# Chaos API

Middleware Node.js (Express/Fastify) que injeta falhas controladas (delay, erros aleatórios, timeout, 503) em requisições HTTP, pra validar resiliência de APIs antes de produção. Um `app.use(chaos())` liga a captura; um dashboard separado liga/desliga cenários em tempo real.

## Project structure

```
application/
  src/
    core/              scenario engine — decide se/como aplicar falha numa request
    adapters/           express.ts, fastify.ts — plugam o core no framework
    scenarios/          delay.ts, random-error.ts, random-timeout.ts, unavailable-503.ts
    dashboard-server/   processo separado — expõe control API local + serve dashboard-ui
    dashboard-ui/       web UI (checkboxes de cenário), consumida pelo dashboard-server
  test/                 mirrors src/
docs/                  architecture, design, testing docs (this skill's output)
deployment/            publish pipeline (npm), CI config
scripts/               build/release scripts
```

Status: pré-implementação — PRD fechado (`docs/PRD.md`), código ainda não escrito.

## Quick start

```bash
npm install
npm run dev            # placeholder até app existir
npm test
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
