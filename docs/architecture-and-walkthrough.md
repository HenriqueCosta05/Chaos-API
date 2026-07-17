# Architecture & Walkthrough

## Visão geral

Chaos API tem dois processos: o **middleware** (roda dentro da aplicação do usuário, intercepta requisições) e o **dashboard** (processo separado, UI + control API pra ligar/desligar cenários em tempo real). Os dois se falam via uma control API local — o middleware nunca depende do dashboard pra funcionar (fail-open se dashboard não estiver rodando).

## Componentes

### core (scenario engine)

- Responsabilidade: manter estado dos cenários ativos (por rota/global), decidir se e como uma request deve ser afetada, registrar feed de atividade
- Localização: `application/src/core/`
- Arquivos principais: `scenario-engine.ts` — aplica cenários na ordem definida pelo registry + matching de rota/host (`resolve` inbound, `resolveOutbound` outbound); `state-store.ts` — estado em memória, normaliza nomes de tipo v1 (legacy) pros primitivos v2 no registro; `activity-log.ts` — buffer em memória de cenários disparados (docs/PRD.md 6.5 "feed de atividade"), `ScenarioEngine` grava um evento por cenário que sobrevive ao rate roll, antes do handler rodar
- Depende de: scenarios (`scenario-engine.ts` importa `SCENARIO_REGISTRY`)

### scenarios

- Responsabilidade: implementação de cada primitivo de falha (docs/PRD.md 6.2): `delay`, `error-response`, `connection-reset`, `unavailable`, `malformed-response`, `stale-response`
- Localização: `application/src/scenarios/`
- Arquivos principais: um arquivo por primitivo, cada um exportando um `ScenarioHandler`; `registry.ts` — fonte única de verdade (tipo + handler + ordem de aplicação), consumido pelo `scenario-engine.ts`. Adicionar um primitivo novo só toca este diretório (arquivo do primitivo + `registry.ts`), não o engine.
- Depende de: core (recebe config resolvida pelo engine; tipos vêm de `core/types.ts`)

### presets

- Responsabilidade: biblioteca de presets (docs/PRD.md 6.3) — catálogo de falhas nomeadas do mundo real, cada uma resolvendo pra `{primitivo, options, scope}`; metadado em cima dos 6 primitivos, não um `ScenarioType` novo
- Localização: `application/src/presets/`
- Arquivos principais: `catalog.ts` — `PRESET_CATALOG`, subconjunto shipado nesta fase (segurança, dependências externas, configuração, esgotamento de recursos, sistema de arquivos — os 5 grupos "Próximo" do roadmap que são HTTP-simulável e não dependem de chaos outbound); `index.ts` — `applyPreset(store, name, overrides?)` registra um preset direto num `StateStore`, `findPreset`/`listPresets` pra navegar o catálogo
- Depende de: core (`applyPreset` chama `StateStore.register`; tipos vêm de `core/types.ts`). Também consumido por `dashboard-server/control-api.ts` (`GET /api/presets`, `POST /api/presets/:name/apply`) — biblioteca navegável na UI (docs/PRD.md 6.5)

### outbound

- Responsabilidade: chaos outbound (docs/PRD.md 6.4) — interceptor simétrico ao inbound, mas com escopo por host de destino em vez de rota; falha "dependência externa X caiu" sem derrubar a dependência de verdade
- Localização: `application/src/outbound/`
- Arquivos principais: `chaos-fetch.ts` — `createChaosFetch(store, options?)` retorna um `fetch` wrapper; sem cenário outbound casando com o host, chama o `fetch` real direto (fast-path); com cenário casando, roda o mesmo `ScenarioEngine` (via `resolveOutbound`) e converte o resultado: handler que escreveu status/body vira um `Response` sintético (sem chamar a rede de verdade); `connection-reset` (nunca escreve resposta) vira `throw` simulando falha de rede; mesmo guardrail de `NODE_ENV=production` do inbound
- Depende de: core (reusa `ScenarioEngine`/`StateStore`; `ScenarioConfig.direction` filtra outbound de inbound)

### adapters

- Responsabilidade: traduzir o scenario engine pra middleware específico de framework
- Localização: `application/src/adapters/`
- Arquivos principais: `express.ts` — `chaos()` retorna middleware Express; `fastify.ts` — plugin Fastify; `nestjs.ts` — `createChaosNestMiddleware()`, middleware funcional (docs/PRD.md 6.6): tipado estruturalmente (sem depender de `@nestjs/common`/Express/Fastify como pacote), com fallback em runtime pra `res.status()/res.send()` (platform-express) vs `res.statusCode`/`res.end()` (platform-fastify, onde middleware funcional recebe o `http.ServerResponse` cru); `koa.ts` — `chaosKoaMiddleware()`, mesmo padrão dos outros dois, usa `ctx.respond = false` (equivalente ao `reply.hijack()` do Fastify) pra `connection-reset` não disparar a resposta automática do Koa
- Depende de: core, scenarios

### dashboard-server

- Responsabilidade: processo separado; serve dashboard-ui estático via `chaos-api dashboard` (CLI, `src/bin/chaos-api.ts`)
- Localização: `application/src/dashboard/server`
- Depende de: core (`control-api.ts` importa `StateStore`/`createControlApi`, mas quem efetivamente expõe a control API é quem chama esse módulo — ver nota abaixo)
- Nota: `control-api.ts` mora nesta pasta mas roda em dois contextos distintos: (a) dentro do processo da app real, criada por `chaos({ controlPort })` nos adapters — control API real, conectada ao StateStore que afeta requests de verdade; (b) standalone dentro do próprio `chaos-api dashboard` (por padrão, desligável com `--no-control-api`) — control API demo, StateStore isolado, só pra exercitar a UI sem escrever uma app. As duas nunca são a mesma instância entre processos.

### dashboard-ui

- Responsabilidade: UI web com checkboxes por cenário/rota, feed de atividade ao vivo, biblioteca de presets navegável
- Localização: `application/src/dashboard/ui`
- Arquivos principais: `app.js` — `refreshActivity()` faz polling de `GET /api/activity?limit=50` a cada 3s e renderiza os eventos mais recentes primeiro; `refreshPresets()` busca `GET /api/presets` (com filtro opcional por categoria) e cada card tem um botão "Aplicar" que chama `POST /api/presets/:name/apply`; export baixa `GET /api/config` como arquivo `.json` (client-side blob), import lê um arquivo local e faz `POST /api/config` com ele; runner de requisição faz `fetch()` direto do browser pra URL informada (método/headers/body), não passa pela control API — testa a própria app sob chaos, não a control API
- Depende de: dashboard-server (consome control API via HTTP; feed de atividade é polling, não WS)

## Fluxo de dados

**Request afetada por chaos:**
1. Client faz request → chega no adapter (Express/Fastify)
2. Adapter chama `scenario-engine.resolve(req)` — verifica cenários ativos que casam com a rota
3. Se houver cenário(s) ativo(s), engine aplica em sequência, na ordem fixa do `SCENARIO_REGISTRY` (ex: delay primeiro, depois error-response) — cenários combináveis
4. Se nenhum cenário ativo pra rota, adapter é no-op — passa direto pro handler real (fast-path)

**Dashboard liga um cenário:**
1. Dev abre `dashboard-ui`, marca checkbox "Delay" pra rota `/orders`
2. `dashboard-ui` chama a control API na URL configurada no topo da página (default `:51820`)
3. Essa control API é a que roda dentro do processo da app real (`chaos({ controlPort: 51820 })`) — ela grava direto no `state-store` que o adapter consulta a cada request
4. Próxima request em `/orders` já reflete o cenário ativo

Se em vez disso a control API respondendo for a standalone do `chaos-api dashboard` (modo demo, sem `--no-control-api`), o toggle só afeta o StateStore isolado dela — não existe app real do outro lado pra sentir o efeito.

**Feed de atividade:**
1. `ScenarioEngine` grava um evento no `ActivityLog` sempre que um cenário sobrevive ao rate roll (antes de rodar o handler) — tanto em `resolve()` (inbound) quanto em `resolveOutbound()`
2. `dashboard-ui` faz polling de `GET /api/activity?limit=50` a cada 3s e mostra os eventos mais recentes primeiro
3. Buffer é em memória, capado (200 eventos por padrão) e por processo — reinicia zerado, sem persistência (mesma decisão do resto do dashboard)

## Decisões de design

### Dashboard como processo separado, não embutido no middleware

- **Escolha**: `dashboard-server` roda como processo próprio (ex: `npx chaos-api dashboard`), fala com o middleware via API local
- **Alternativas consideradas**: dashboard servido pelo próprio middleware, no mesmo processo da app
- **Por quê**: evita acoplar build/bundle do dashboard (UI, assets) ao pacote que roda dentro da app do usuário; middleware fica leve e fast-path quando chaos off; dashboard pode ser atualizado sem reiniciar a app

### Cenários combináveis desde o v1

- **Escolha**: mais de um cenário pode estar ativo na mesma rota, aplicados em sequência (ex: delay + random-error)
- **Alternativas consideradas**: um cenário por rota por vez (mais simples, mas menos realista)
- **Por quê**: cenários reais de produção raramente são isolados (ex: lentidão + erro intermitente juntos); combinável desde já evita retrabalho de arquitetura depois

### Guardrail de produção via `NODE_ENV`

- **Escolha**: middleware verifica `NODE_ENV=production` e bloqueia/avisa por padrão
- **Alternativas consideradas**: nenhum guardrail, confiar no dev pra não instalar em prod
- **Por quê**: risco alto (ver PRD, seção Riscos) — ativação esquecida vazando pra produção quebra clientes reais

### 6 primitivos genéricos em vez de um tipo por cenário

- **Escolha**: `ScenarioType` é um conjunto fechado de 6 primitivos configuráveis (`delay`, `error-response`, `connection-reset`, `unavailable`, `malformed-response`, `stale-response`); nomes de cenário do catálogo real (docs/PRD.md 6.3, ~85 itens) resolvem pra um primitivo + opções, não viram tipo novo
- **Alternativas consideradas**: um `ScenarioType` por nome de falha do catálogo (o que o v1 fazia com 4 tipos)
- **Por quê**: um enum fechado por nome de falha não escala pra ~85 itens — cada um exigiria mudança em `core/types.ts`, novo arquivo em `scenarios/`, barrel, `scenario-engine.ts` e UI; nomes de tipo v1 (`random-error`, `random-timeout`, `unavailable-503`) continuam aceitos em `StateStore.register` e são normalizados pro primitivo equivalente, então configs existentes não quebram

### Chaos outbound reusa o ScenarioEngine, não duplica a lógica de cenário

- **Escolha**: `direction: "inbound" | "outbound"` vira um campo em `ScenarioConfig` (não uma variação de `ScenarioScope`); `StateStore.getActiveOutbound(host)` e `ScenarioEngine.resolveOutbound()` espelham `getActiveForPath`/`resolve()`, reusando os mesmos 6 primitivos e o mesmo `ChaosResponseController` — o wrapper de fetch só grava status/headers/body num objeto e depois converte pra `Response` (ou `throw`, no caso de `connection-reset`)
- **Alternativas consideradas**: engine/tipos separados pra outbound, já que semanticamente é "chamada de saída" e não "request recebida"
- **Por quê**: os primitivos (delay, error-response, connection-reset, unavailable, malformed-response, stale-response) já descrevem o comportamento certo pros dois sentidos — duplicar o engine pra outbound só pra trocar "path" por "host" seria puro retrabalho; o único ponto real de diferença (não escrever de verdade numa conexão TCP existente, e sim decidir se chama o `fetch` real ou retorna algo sintético) fica isolado no wrapper (`outbound/chaos-fetch.ts`)

### Runner de requisição chama a app direto do browser, não via control API

- **Escolha**: `dashboard-ui` faz `fetch(url, {method, headers, body})` direto pro endereço que o usuário digitar, sem passar pela control API como proxy
- **Alternativas consideradas**: control API como proxy (`POST /api/runner` encaminhando a requisição no processo Node)
- **Por quê**: um proxy no processo da control API teria o mesmo overhead de reimplementar um cliente HTTP genérico (streaming de body, headers arbitrários, timeouts) só pra repassar bytes; fetch direto do browser é mais simples e já é como o dev testaria manualmente com curl/Postman — trade-off aceito: sujeito a CORS da app-alvo (mesma limitação de qualquer client browser-side, documentada, não é bug do chaos-api)

### Import de config substitui o StateStore, não faz merge

- **Escolha**: `POST /api/config` chama `store.clear()` antes de registrar os cenários do JSON importado — o resultado é sempre exatamente o conteúdo do arquivo, nunca uma combinação com o que já estava ativo
- **Alternativas consideradas**: merge (soma cenários importados aos já ativos)
- **Por quê**: merge tem semântica ambígua sem um identificador estável entre exports (ids são regenerados a cada `register`, então "atualizar" um cenário existente via import não tem como funcionar de forma previsível); "substituir" é a leitura mais óbvia de "carregar uma config" e evita duplicar cenário equivalente já ativo

### Feed de atividade via polling, não WebSocket

- **Escolha**: `dashboard-ui` faz `setInterval` de 3s chamando `GET /api/activity`, em vez de abrir um WebSocket/SSE na control API
- **Alternativas consideradas**: push em tempo real via WebSocket
- **Por quê**: control API já é HTTP puro (`node:http`, sem framework) — WS exigiria upgrade de conexão e estado de socket vivo por client conectado, complexidade desproporcional pro caso de uso (ferramenta local/dev, latência de poucos segundos é aceitável); mesma filosofia de "zero dependência pesada" do resto do dashboard

### Biblioteca de presets: subconjunto HTTP-simulável primeiro

- **Escolha**: primeiro incremento de presets cobre só 5 das 17 categorias do catálogo completo (docs/PRD.md 6.3) — segurança, dependências externas, configuração, esgotamento de recursos, sistema de arquivos — 21 presets
- **Alternativas consideradas**: implementar as ~85 entradas do catálogo de uma vez
- **Por quê**: as demais categorias dependem de trabalho ainda não feito — chaos outbound (6.4, pra dependências externas "de verdade" via wrapper de fetch/axios, hoje simuladas como cenário inbound comum), presets compostos (erro humano, black swan) ou são explicitamente **Later** (message queues, k8s, sistemas distribuídos — exigem acesso a infra real, fora do escopo do pacote); mesma lógica de passo pequeno e testável usada no refactor de primitivos (6.1/6.2)

### Adapter NestJS: middleware funcional com tipos estruturais, não `@nestjs/common`

- **Escolha**: `createChaosNestMiddleware()` retorna uma função `(req, res, next) => void` compatível com `NestMiddleware`/middleware funcional do Nest, tipada com interfaces locais (`NestLikeRequest`/`NestLikeResponse`) em vez de importar `@nestjs/common`; a resposta detecta em runtime se `res.status`/`res.send` existem (Express) ou usa `res.statusCode`/`res.end` (Fastify cru)
- **Alternativas consideradas**: classe `@Injectable() class ChaosMiddleware implements NestMiddleware`, com `@nestjs/common` como peer dependency
- **Por quê**: "zero dependências pesadas no core" (docs/PRD.md 10) — adicionar `@nestjs/common` só pra um tipo de interface obrigaria qualquer consumidor do pacote a instalá-lo, mesmo quem usa só Express/Fastify puro; Nest aceita middleware funcional sem decorators, então a função simples já é 100% compatível sem o pacote

### Adapter Koa usa os tipos reais do pacote `koa`, ao contrário do NestJS

- **Escolha**: `koa.ts` importa `Context`/`Middleware` de `koa` (peer dependency opcional, igual `express`/`fastify`), em vez de tipar estruturalmente como o adapter NestJS
- **Alternativas consideradas**: mesma abordagem estrutural do `nestjs.ts`, sem depender do pacote `koa`
- **Por quê**: Koa é, como Express/Fastify, só o framework HTTP em si — leve, sem sistema de DI, já é exatamente o tipo de dependência que os outros dois adapters já assumem como peer opcional; a exceção foi `@nestjs/common`, que arrasta um framework de aplicação inteiro (DI, decorators, módulos) só pra tipar uma função de middleware

## Jornadas de usuário

### Dev ativa delay numa rota específica

1. Dev instala `@henriquecosta/chaos-api`, adiciona `app.use(chaos())` na app
2. Roda `npx chaos-api dashboard`, abre `localhost:4000/dashboard`
3. Marca "Delay" pra rota `/checkout`, define range 500-2000ms
4. Faz requests normalmente na app — `/checkout` agora responde com delay, resto da API intacta

### Backend dev testa client contra Stripe fora do ar

1. Dev troca `fetch` por `createChaosFetch(store)` nas chamadas que fazem pro Stripe (ou qualquer dependência externa)
2. Ativa cenário `unavailable` com `direction: "outbound"` e `scope: { pattern: "api.stripe.com" }`
3. Chamadas subsequentes pra `api.stripe.com` recebem 503 sintético sem sair da máquina — resto das chamadas de saída (outros hosts) passam direto (fast-path)
4. Observa se o client trata o 503 corretamente (retry, circuit breaker, mensagem de erro pro usuário)

### QA reproduz 503 intermitente

1. QA ativa cenário "HTTP 503" com 30% de taxa, escopo global
2. Roda suite de testes de resiliência do client contra a API local
3. Observa se retries/circuit breaker do client reagem corretamente aos 503s intermitentes
