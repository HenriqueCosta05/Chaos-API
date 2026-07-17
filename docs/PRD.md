# PRD — Chaos API

**Status:** Draft v2.0
**Date:** 2026-07-15
**Owner:** Henrique Costa

---

## 1. Resumo

Chaos API é middleware Node.js que injeta falhas controladas em requisições HTTP — delay, erros, timeout, indisponibilidade, respostas malformadas/obsoletas — pra times validarem resiliência (retries, circuit breakers, UX de erro) antes de produção, sem alterar código da aplicação.

```js
app.use(chaos())
```

v1 cobriu falhas **inbound** (requisições que chegam na API). v2 expande em três direções: (a) catálogo de cenários muito maior, organizado por categoria de falha real (compute, storage, rede, DB, cache, filas, k8s, LB, segurança, dependências externas, config, tempo, exhaustion, erro humano, sistemas distribuídos, observabilidade, filesystem, black swan); (b) chaos **outbound** — falhas nas chamadas que a própria API faz pra fora (APIs de terceiros, DBs, storage externo); (c) dashboard mais rico, com feed de atividade, runner de requisições de teste e biblioteca de presets.

Dashboard em `localhost:4000/dashboard` liga/desliga cenários em tempo real.

---

## 2. Problema

Dev normalmente só testa caminho feliz. Produção traz: lentidão, timeouts, 500s, respostas inválidas/obsoletas, indisponibilidade parcial, dependências externas falhando, erros intermitentes. Raramente testado pré-deploy — e raramente é possível testar o caso de "o Stripe/S3/IdP que eu chamo caiu", porque essas falhas vêm de fora, não da própria API.

Consequência: retries não validados, circuit breakers nunca exercitados, clientes quebram, integrações com terceiros quebram em produção pela primeira vez, UX piora, incidentes só aparecem em produção.

## 3. Objetivo

Deixar qualquer dev ativar falhas — na própria API ou nas dependências que ela chama — durante desenvolvimento, sem tocar no código da aplicação: 1 linha de middleware/interceptor + toggle via dashboard.

## 4. Público-alvo

- Backend Developers
- Full Stack Developers
- QA Engineers
- SRE Engineers

## 5. Personas & Jobs-to-be-done

| Persona | Job |
|---|---|
| Backend Dev | "Quero saber se meu client aguenta timeout do serviço X antes de subir" |
| Backend Dev | "Quero saber se meu client aguenta o Stripe/S3/IdP retornando 500 ou dando timeout" |
| QA Engineer | "Quero reproduzir 503 intermitente pra testar plano de teste de resiliência" |
| SRE | "Quero forçar cenário de degradação parcial em staging pra validar alertas" |

## 6. Escopo v2

### 6.1 Middleware core

- Pacote npm instalável (`npm i @henriquecosta/chaos-api`), zero-config por padrão (no-op se nenhum cenário ativo).
- Intercepta request/response (inbound) e, opcionalmente, chamadas de saída (outbound — ver 6.4).

**Decisão de arquitetura v2:** o v1 tinha 4 `ScenarioType` fixos, cada um exigindo mudança em ~5 arquivos pra adicionar (`core/types.ts`, novo arquivo em `scenarios/`, barrel `scenarios/index.ts`, `PRIORITY`/`HANDLERS` no `scenario-engine.ts`, `<option>` na UI). O catálogo de falhas reais (~85 itens, seção 6.3) não escala como enum fechado + switch. v2 consolida comportamento em **6 primitivos genéricos e configuráveis** (6.2); os ~85 nomes viram uma **biblioteca de presets** (6.3) — metadado (nome, categoria, descrição) apontando pra `{primitivo, options, scope}`. Isso implica um refactor do engine pra um registry pattern (item "Next" — não faz parte deste PRD como código, só como decisão documentada).

### 6.2 Primitivos de cenário

| Primitivo | Generaliza (v1) | Comportamento |
|---|---|---|
| `delay` | `delay` | Atrasa resposta X ms (fixo ou range) |
| `error-response` | `random-error` | Retorna status/body/headers configuráveis numa % das requisições; opção de restringir por método HTTP (write-verbs only, etc.) |
| `connection-reset` | `random-timeout` (parcial) | Derruba a conexão abruptamente, sem resposta |
| `unavailable` | `unavailable-503` | Status configurável (503/507/429) + `Retry-After` opcional |
| `malformed-response` | *novo* | Corrompe/trunca body, content-type incorreto |
| `stale-response` | *novo* | Serve uma resposta anterior/cacheada em vez da atual |

Cenários continuam combináveis (delay + error-response na mesma rota, por exemplo), com ordem de aplicação fixa entre primitivos.

### 6.3 Biblioteca de presets (catálogo de falhas)

Cada linha resolve pra um primitivo (6.2) com opções/escopo pré-configurados. Coluna "Camada" indica se é simulável via HTTP (in-process, seguro) ou se exige injeção real de infra (**Depois**, fora deste pacote — ver seção 7).

| Categoria | Exemplos representativos | Primitivo | Camada |
|---|---|---|---|
| Computação & SO | CPU saturation, memory exhaustion, FD exhaustion, random reboot | `delay` / `connection-reset` | HTTP-simulado |
| Armazenamento | Disk I/O latency, volume detached, read-only filesystem, disk corruption, temp dir full | `delay` / `unavailable` / `error-response` (write-only) / `malformed-response` | HTTP-simulado |
| Rede | Packet loss, high latency, network partition, DNS failure, TCP resets | `connection-reset` / `delay` / `unavailable` | HTTP-simulado |
| Banco de dados | DB unavailable, slow queries, pool exhaustion, replica lag, deadlocks | `unavailable` / `delay` / `stale-response` | HTTP-simulado |
| Cache | Cache unavailable, cold start, eviction storm, high latency, stale data | `unavailable` / `delay` / `stale-response` | HTTP-simulado |
| Filas de mensagens | Backlog growth, consumer crash, broker failure, poison messages | — | **Depois** (chaos de worker/broker precisa de SDK do lado do consumer, não HTTP middleware) |
| Containers & k8s | Pod crash, node failure, image pull failure, PVC unavailable | — | **Depois** (precisa de acesso à API do docker/k8s) |
| Balanceadores de carga | LB unavailable, health check failures, backend removido, TLS termination failure | `unavailable` / `error-response` | Falha de health-check é HTTP-simulável; resto é **Depois** (config real de infra) |
| Segurança | TLS expirado, auth/authz service down, credenciais expiradas, secret rotation failure | `error-response` (401/403/495) | HTTP-simulado |
| Dependências externas | Third-party API timeout/500/rate-limit, object storage down, IdP down | `delay` / `error-response` / `unavailable` (via **chaos outbound**, 6.4) | HTTP-simulado |
| Configuração | Env var faltando, config inválida, endpoint errado, feature flag incorreta | `error-response` (500 com corpo descritivo) | HTTP-simulado |
| Tempo | Clock skew, NTP unavailable, clock jumps, cron duplicado | Header/body de timestamp manipulado (extensão de `error-response`/`stale-response`) | **Depois** (baixa prioridade, design próprio) |
| Esgotamento de recursos | Thread pool, connection pool, ephemeral ports, disk IOPS | `unavailable` / `delay` | HTTP-simulado |
| Erro humano | Bad deploy, rollback falho, firewall/DNS errado, deleção acidental | Preset composto (combinação de primitivos + janela de tempo) | HTTP-simulado (como preset composto) |
| Sistemas distribuídos | Split brain, leader election failure, lost quorum, service discovery failure | — | **Depois** (exige múltiplas instâncias coordenadas) |
| Observabilidade | Metrics/log/tracing backend down, alerting disabled | `unavailable` (aplicado ao próprio endpoint de métricas, se exposto) | HTTP-simulado, baixa prioridade |
| Sistema de arquivos | Permission denied, TLS cert ausente, NFS unavailable, fs corruption | `error-response` (403) / `malformed-response` | HTTP-simulado |
| Cisne negro | 1% falhas aleatórias, retry storm, health check verde com request falhando | Preset composto (vários primitivos com rates diferentes) | HTTP-simulado (como preset composto) |

### 6.4 Chaos outbound

Novo tipo de interceptor, simétrico ao inbound mas com escopo por host de destino (`api.stripe.com/*`) em vez de rota própria. Requer estender `ScenarioScope` com uma tag `direction: "inbound" | "outbound"` (hoje implicitamente inbound). Mecanismo: wrapper de `fetch`/axios ou patch no http agent, consultando o mesmo `StateStore`. É o mecanismo concreto pra testar "o que acontece se minha dependência externa falhar" sem precisar derrubar a dependência de verdade.

### 6.5 Dashboard v2

- **Feed de atividade** — engine emite evento por cenário disparado (buffer em memória, sem dependência externa); control API expõe (`GET /api/activity`); dashboard mostra log ao vivo. Hoje não existe nenhuma visibilidade do que disparou e quando.
- **Runner de requisição de teste** — painel na UI pra montar e enviar uma requisição real (método/URL/headers/body) contra a própria API rodando, e ver a resposta — sem sair do dashboard.
- **Biblioteca de presets** — catálogo navegável (seção 6.3), aplicável com um clique.
- **Import/export de config** — salvar/carregar conjunto de cenários como JSON (já era item "Next" no v1, mantido e amarrado à biblioteca de presets).
- Continua sem persistência obrigatória nem autenticação (mesma decisão do v1 — uso local/dev).

### 6.6 Frameworks

- Express, Fastify — shipped (v1).
- NestJS, Koa — promovidos de "Depois" pra "Próximo": adapters finos sobre o mesmo core compartilhado (`ScenarioEngine`/`StateStore`/`ChaosResponseController`), seguindo o padrão já usado em `express.ts`/`fastify.ts`. Não exige mudança no core.
- Hapi — mantido em "Depois".

### 6.7 Config programática

Alternativa à UI: `chaos({ scenarios: [...] })` no código, pra CI/testes automatizados. Inalterado do v1.

## 7. Fora de escopo (v2)

- **Injeção real de falha em infraestrutura** — estressar CPU/memória/disco do host de verdade, `tc`/`netem` pra falhas de rede reais, chamadas à API do docker/k8s pra matar pods/nodes. Motivo: exige root/acesso ao socket do docker/cluster — superfície de engenharia bem diferente de um middleware in-process, e genuinamente perigosa se mal configurada. Provavelmente uma ferramenta companion separada, não este pacote npm.
- **Chaos de worker/broker de fila** (consumer crash, broker failure) — exige SDK do lado do consumer, não HTTP middleware.
- **Coordenação multi-instância/distribuída** (split brain, quorum, leader election) — exige múltiplas instâncias coordenadas, fora do modelo de um único processo.
- Produção / ambientes públicos (guardrail: warning se `NODE_ENV=production`, estendido ao chaos outbound).
- Frameworks além de Express/Fastify/NestJS/Koa (Hapi fica pra depois; outros não previstos).
- Persistência de config entre restarts (fica pro import/export manual, 6.5).
- Multi-usuário / permissões no dashboard.
- Métricas/observabilidade exportadas (Prometheus etc.).

## 8. Métricas de sucesso

- **Ativação:** tempo entre `npm install` e primeiro cenário ativado < 5 min
- **Adoção:** nº de instalações npm / semana (pós-launch)
- **Retenção de uso:** % de projetos que reabrem o dashboard em 2+ sessões
- **Cobertura de preset:** % de categorias do catálogo (6.3) com pelo menos um preset utilizável
- **Qualitativo:** feedback de que testes de resiliência (retry/circuit breaker, incluindo contra dependências externas) foram exercitados que antes não eram

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Cenário ativado esquecido, vaza pra produção | Warning/bloqueio automático se `NODE_ENV=production`; flag explícita pra permitir; mesma guarda vale pro chaos outbound |
| Dashboard sem auth exposto em rede compartilhada | Bind default em `localhost`; doc clara de risco se exposto |
| Overhead de latência do middleware mesmo com chaos off | Fast-path no-op quando nenhum cenário ativo (inbound e outbound) |
| Incompatibilidade entre versões de framework | Adapters isolados + matriz de testes por versão suportada |
| Preset dá falsa confiança de que falha de infra foi "realmente" testada | Rotular explicitamente na UI/docs que presets de infra são simulação na camada HTTP do sintoma observável, não injeção real na infra |
| Chaos outbound intercepta chamada de terceiro sem querer em produção | Mesmo guardrail de `NODE_ENV=production`; allowlist opt-in por host de destino |

## 10. Requisitos técnicos (alto nível)

- Node.js >= 18, TypeScript
- Zero dependências pesadas no core (dashboard pode ser bundle separado servido estático)
- Middleware (inbound e outbound) não deve modificar body/headers fora dos cenários ativos
- Interceptor outbound não deve adicionar overhead quando nenhum cenário outbound está configurado — mesmo princípio de fast-path do inbound
- Testável: helpers pra ativar cenário via config em testes automatizados (sem precisar da UI)

## 11. Roadmap (Agora / Próximo / Depois)

**Agora (v1 — já shipado, baseline):**
- Middleware Express/Fastify + 4 cenários (Delay, Random Errors, Random Timeout, 503)
- Dashboard básico com toggles
- Guardrail de produção

**Próximo:**
- Refactor de consolidação em primitivos (registry pattern, generalizando os 4 tipos v1 nos 6 primitivos de 6.2, sem quebrar configs existentes)
- Biblioteca de presets — subconjunto HTTP-simulável: segurança, dependências externas, configuração, esgotamento de recursos, sistema de arquivos
- Chaos outbound (wrapper de fetch/axios)
- Dashboard: feed de atividade, biblioteca de presets, runner de requisição de teste, import/export
- Adapters NestJS e Koa

**Depois:**
- Presets restantes que exigem mais design (tempo/clock, presets compostos de erro humano e black swan)
- Adapter Hapi
- Injeção real de falha em infraestrutura (ferramenta/design separado — stress de CPU/memória/disco, `tc`/`netem`, ações via API docker/k8s, chaos de worker/broker de fila, split-brain/quorum distribuído) — superfície de engenharia diferente (exige root/socket docker/acesso a cluster), não é extensão natural do middleware in-process
- Métricas/export (Prometheus, OpenTelemetry), auth no dashboard + multi-projeto, chaos-as-config em YAML, modo distribuído (múltiplos serviços coordenados)
