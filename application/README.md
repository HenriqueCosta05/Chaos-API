# @henriquecosta/chaos-api

Middleware pra simular falhas de produção — delay, erros, timeout, indisponibilidade, respostas malformadas/obsoletas — em APIs Express/Fastify/NestJS/Koa durante desenvolvimento.

Vem com control API + dashboard UI pra ligar/desligar cenários em tempo real, e um wrapper de `fetch` outbound pra injetar caos em chamadas que sua aplicação faz pra APIs de terceiros.

## Instalação

```bash
npm install @henriquecosta/chaos-api
```

## Início rápido (Express)

```ts
import express from "express";
import { chaos } from "@henriquecosta/chaos-api";

const app = express();
const chaosMiddleware = chaos({ controlPort: 51820 });

app.use(chaosMiddleware);

app.get("/orders/:id", (req, res) => {
  res.json({ id: req.params.id });
});

app.listen(3000);
```

Registre um cenário no store exposto pelo middleware:

```ts
chaosMiddleware.store.register({
  type: "delay",
  scope: { pattern: "/orders/*" },
  rate: 0.5, // aplica em 50% das requisições que casam com o scope
  options: { minMs: 300, maxMs: 1500 },
});
```

Rode `npx chaos-api dashboard` e abra `http://localhost:4000/dashboard` pra alternar cenários visualmente em vez disso (ele fala com a `controlPort` acima).

## Adapters de framework

### Fastify

```ts
import Fastify from "fastify";
import { chaosFastifyPlugin } from "@henriquecosta/chaos-api";

const fastify = Fastify();
const chaosPlugin = chaosFastifyPlugin({ controlPort: 51820 });

await fastify.register(chaosPlugin);
```

### NestJS

```ts
// main.ts
import { createChaosNestMiddleware } from "@henriquecosta/chaos-api";

app.use(createChaosNestMiddleware({ controlPort: 51820 }));
```

Ou registre por módulo via `NestModule.configure()`:

```ts
consumer.apply(createChaosNestMiddleware()).forRoutes("*");
```

### Koa

```ts
import Koa from "koa";
import { chaosKoaMiddleware } from "@henriquecosta/chaos-api";

const app = new Koa();
app.use(chaosKoaMiddleware({ controlPort: 51820 }));
```

## Tipos de cenário

Seis primitivos, casados por caminho da requisição (`scope`) e probabilidade (`rate`):

| type                 | efeito                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `delay`               | Adiciona latência antes de continuar a requisição (`minMs`/`maxMs`). |
| `error-response`      | Interrompe com status/body (`statusCodes`, `body`, `headers`, `methods`). |
| `connection-reset`    | Derruba a conexão — nenhuma resposta é escrita.                   |
| `unavailable`         | Retorna um status fixo de indisponibilidade (`statusCode`, padrão 503). |
| `malformed-response`  | Retorna um body de resposta estruturalmente quebrado.             |
| `stale-response`      | Retorna um body de resposta em cache/desatualizado.                |

```ts
chaosMiddleware.store.register({
  type: "error-response",
  scope: { pattern: "/payments/*" },
  direction: "inbound", // padrão; "outbound" escopa pelo host de destino em vez do path
  rate: 0.2,
  options: { statusCodes: [500, 502], body: { error: "payment provider unavailable" } },
});
```

Use `scope: "global"` (padrão) pra aplicar um cenário em todas as rotas.

## Presets

Catálogo com ~85 itens de cenários nomeados e pré-configurados (queda de auth, timeout de terceiros, erro de config etc.) mapeados sobre os seis primitivos acima:

```ts
import { applyPreset, listPresets } from "@henriquecosta/chaos-api";

listPresets("dependencias-externas"); // navega por categoria

applyPreset(chaosMiddleware.store, "third-party-rate-limit", {
  scope: { pattern: "/checkout/*" },
  rate: 0.3,
});
```

## Caos outbound (chamadas que sua aplicação faz)

Envolva o `fetch` pra que cenários registrados com `direction: "outbound"` intercepetem chamadas pra um host de destino:

```ts
import { createChaosFetch } from "@henriquecosta/chaos-api";

const chaosFetch = createChaosFetch(chaosMiddleware.store);

chaosMiddleware.store.register({
  type: "connection-reset",
  direction: "outbound",
  scope: { pattern: "api.stripe.com" },
  rate: 0.1,
});

await chaosFetch("https://api.stripe.com/v1/charges"); // pode lançar uma falha de rede simulada
```

## Guardrail de produção

Cenários são desabilitados automaticamente quando `NODE_ENV=production`, pra evitar que um cenário ativo vaze pro tráfego real. Override (não recomendado) com:

```ts
chaos({ allowInProduction: true });
```

## CLI do dashboard

```bash
npx chaos-api dashboard [--port <n>] [--control-port <n>] [--no-control-api]
```

Serve a UI do dashboard (padrão `http://localhost:4000/dashboard`). Por padrão também sobe uma control API standalone pra demo; passe `--no-control-api` quando sua aplicação já roda `chaos({ controlPort })` e você só quer a UI.

## Licença

MIT
