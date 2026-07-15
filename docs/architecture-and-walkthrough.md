# Architecture & Walkthrough

## Overview

Chaos API tem dois processos: o **middleware** (roda dentro da aplicação do usuário, intercepta requisições) e o **dashboard** (processo separado, UI + control API pra ligar/desligar cenários em tempo real). Os dois se falam via uma control API local — o middleware nunca depende do dashboard pra funcionar (fail-open se dashboard não estiver rodando).

## Components

### core (scenario engine)

- Responsibility: manter estado dos cenários ativos (por rota/global), decidir se e como uma request deve ser afetada
- Location: `application/src/core/`
- Key files: `scenario-engine.ts` — registry + matching de rota; `state-store.ts` — estado em memória
- Depends on: nothing internal

### scenarios

- Responsibility: implementação de cada tipo de falha (delay, random-error, random-timeout, 503)
- Location: `application/src/scenarios/`
- Key files: `delay.ts`, `random-error.ts`, `random-timeout.ts`, `unavailable-503.ts` — cada um exporta uma função `apply(req, res, next, config)`
- Depends on: core (recebe config resolvida pelo engine)

### adapters

- Responsibility: traduzir o scenario engine pra middleware específico de framework
- Location: `application/src/adapters/`
- Key files: `express.ts` — `chaos()` retorna middleware Express; `fastify.ts` — plugin Fastify
- Depends on: core, scenarios

### dashboard-server

- Responsibility: processo separado; serve dashboard-ui estático via `chaos-api dashboard` (CLI, `src/bin/chaos-api.ts`)
- Location: `application/src/dashboard/server`
- Depends on: core (`control-api.ts` importa `StateStore`/`createControlApi`, mas quem efetivamente expõe a control API é quem chama esse módulo — ver nota abaixo)
- Note: `control-api.ts` mora nesta pasta mas roda em dois contextos distintos: (a) dentro do processo da app real, criada por `chaos({ controlPort })` nos adapters — control API real, conectada ao StateStore que afeta requests de verdade; (b) standalone dentro do próprio `chaos-api dashboard` (por padrão, desligável com `--no-control-api`) — control API demo, StateStore isolado, só pra exercitar a UI sem escrever uma app. As duas nunca são a mesma instância entre processos.

### dashboard-ui

- Responsibility: UI web com checkboxes por cenário/rota
- Location: `application/src/dashboard/ui`
- Depends on: dashboard-server (consome control API via HTTP/WS)

## Data flow

**Request afetada por chaos:**
1. Client faz request → chega no adapter (Express/Fastify)
2. Adapter chama `scenario-engine.resolve(req)` — verifica cenários ativos que casam com a rota
3. Se houver cenário(s) ativo(s), engine aplica em sequência (ex: delay primeiro, depois random-error) — cenários combináveis
4. Se nenhum cenário ativo pra rota, adapter é no-op — passa direto pro handler real (fast-path)

**Dashboard liga um cenário:**
1. Dev abre `dashboard-ui`, marca checkbox "Delay" pra rota `/orders`
2. `dashboard-ui` chama a control API na URL configurada no topo da página (default `:51820`)
3. Essa control API é a que roda dentro do processo da app real (`chaos({ controlPort: 51820 })`) — ela grava direto no `state-store` que o adapter consulta a cada request
4. Próxima request em `/orders` já reflete o cenário ativo

Se em vez disso a control API respondendo for a standalone do `chaos-api dashboard` (modo demo, sem `--no-control-api`), o toggle só afeta o StateStore isolado dela — não existe app real do outro lado pra sentir o efeito.

## Design decisions

### Dashboard como processo separado, não embutido no middleware

- **Choice**: `dashboard-server` roda como processo próprio (ex: `npx chaos-api dashboard`), fala com o middleware via API local
- **Alternatives considered**: dashboard servido pelo próprio middleware, no mesmo processo da app
- **Why**: evita acoplar build/bundle do dashboard (UI, assets) ao pacote que roda dentro da app do usuário; middleware fica leve e fast-path quando chaos off; dashboard pode ser atualizado sem reiniciar a app

### Cenários combináveis desde o v1

- **Choice**: mais de um cenário pode estar ativo na mesma rota, aplicados em sequência (ex: delay + random-error)
- **Alternatives considered**: um cenário por rota por vez (mais simples, mas menos realista)
- **Why**: cenários reais de produção raramente são isolados (ex: lentidão + erro intermitente juntos); combinável desde já evita retrabalho de arquitetura depois

### Guardrail de produção via `NODE_ENV`

- **Choice**: middleware verifica `NODE_ENV=production` e bloqueia/avisa por padrão
- **Alternatives considered**: nenhum guardrail, confiar no dev pra não instalar em prod
- **Why**: risco alto (ver PRD, seção Riscos) — ativação esquecida vazando pra produção quebra clientes reais

## User journeys

### Dev ativa delay numa rota específica

1. Dev instala `@henriquecosta/chaos-api`, adiciona `app.use(chaos())` na app
2. Roda `npx chaos-api dashboard`, abre `localhost:4000/dashboard`
3. Marca "Delay" pra rota `/checkout`, define range 500-2000ms
4. Faz requests normalmente na app — `/checkout` agora responde com delay, resto da API intacta

### QA reproduz 503 intermitente

1. QA ativa cenário "HTTP 503" com 30% de taxa, escopo global
2. Roda suite de testes de resiliência do client contra a API local
3. Observa se retries/circuit breaker do client reagem corretamente aos 503s intermitentes
