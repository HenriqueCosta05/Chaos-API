# PRD — Chaos API

**Status:** Draft v1.0
**Date:** 2026-07-13
**Owner:** Henrique Costa

---

## 1. Resumo

Chaos API é middleware Node.js (Express/Fastify) que injeta falhas controladas em requisições HTTP — delay, erros aleatórios, timeout, 503 — pra times validarem resiliência (retries, circuit breakers, UX de erro) antes de produção, sem alterar código da aplicação.

```js
app.use(chaos())
```
Dashboard em `localhost:4000/dashboard` liga/desliga cenários em tempo real.

---

## 2. Problema

Dev normalmente só testa caminho feliz. Produção traz: lentidão, timeouts, 500s, respostas inválidas, indisponibilidade parcial, erros intermitentes. Raramente testado pré-deploy.

Consequência: retries não validados, circuit breakers nunca exercitados, clientes quebram, UX piora, incidentes só aparecem em produção.

## 3. Objetivo

Deixar qualquer dev ativar falhas na própria API durante desenvolvimento, sem tocar no código da aplicação — 1 linha de middleware + toggle via dashboard.

## 4. Público-alvo

- Backend Developers
- Full Stack Developers
- QA Engineers
- SRE Engineers

## 5. Personas & Jobs-to-be-done

| Persona | Job |
|---|---|
| Backend Dev | "Quero saber se meu client aguenta timeout do serviço X antes de subir" |
| QA Engineer | "Quero reproduzir 503 intermitente pra testar plano de teste de resiliência" |
| SRE | "Quero forçar cenário de degradação parcial em staging pra validar alertas" |

## 6. Escopo v1 (MVP)

### 6.1 Middleware core
- Pacote npm instalável (`npm i @henriquecosta/chaos-api`), zero-config por padrão (no-op se nenhum cenário ativo).
- Suporte Express e Fastify (adapter por framework).
- Intercepta request/response, aplica falha configurada antes de repassar ao handler real (ou no lugar dele, conforme cenário).

### 6.2 Cenários de falha (v1)
| Cenário | Comportamento |
|---|---|
| Delay | Atrasa resposta em X ms (fixo ou range aleatório) |
| Random Errors | Retorna erro aleatório (4xx/5xx configurável) numa % das requisições |
| Random Timeout | Não responde, conexão expira |
| HTTP 503 | Força indisponibilidade (com/sem `Retry-After`) |

Cada cenário: liga/desliga, % de requisições afetadas, escopo por rota (glob/regex) ou global. Cenários combináveis em v1 (ex: delay + random error na mesma rota, aplicados em sequência).

### 6.3 Dashboard
- Processo separado do middleware (server próprio, ex: `npx chaos-api dashboard`), fala com o middleware via API local (ex: HTTP/WS em porta própria).
- UI web local (`/dashboard` no processo separado, porta configurável).
- Checkboxes pra ligar/desligar cada cenário por rota ou global.
- Sem persistência obrigatória em v1 — estado em memória (reset ao reiniciar processo).
- Sem autenticação em v1 (assume uso local/dev — ver Riscos).

### 6.4 Config programática
- Alternativa à UI: `chaos({ scenarios: [...] })` no código, pra CI/testes automatizados.

## 7. Fora de escopo (v1)

- Produção / ambientes públicos (guardrail: warning se `NODE_ENV=production`)
- Frameworks além de Express/Fastify (NestJS, Koa etc.)
- Persistência de config entre restarts
- Multi-usuário / permissões no dashboard
- Métricas/observabilidade exportadas (Prometheus etc.)
- Chaos em nível de infra (rede, CPU, memória do processo)

## 8. Métricas de sucesso

- **Ativação:** tempo entre `npm install` e primeiro cenário ativado < 5 min
- **Adoção:** nº de instalações npm / semana (pós-launch)
- **Retenção de uso:** % de projetos que reabrem o dashboard em 2+ sessões
- **Qualitativo:** feedback de que testes de resiliência (retry/circuit breaker) foram exercitados que antes não eram

## 9. Riscos & mitigações

| Risco | Mitigação |
|---|---|
| Cenário ativado esquecido, vaza pra produção | Warning/bloqueio automático se `NODE_ENV=production`; flag explícita pra permitir |
| Dashboard sem auth exposto em rede compartilhada | Bind default em `localhost`; doc clara de risco se exposto |
| Overhead de latência do middleware mesmo com chaos off | Fast-path no-op quando nenhum cenário ativo |
| Incompatibilidade entre versões Express/Fastify | Adapters isolados + matriz de testes por versão suportada |

## 10. Requisitos técnicos (alto nível)

- Node.js >= 18, TypeScript
- Zero dependências pesadas no core (dashboard pode ser bundle separado servido estático)
- Middleware não deve modificar body/headers fora dos cenários ativos
- Testável: helpers pra ativar cenário via config em testes automatizados (sem precisar da UI)

## 11. Roadmap (Now / Next / Later)

**Now (v1 — MVP):**
- Middleware Express/Fastify + 4 cenários (Delay, Random Errors, Random Timeout, 503)
- Dashboard básico com toggles
- Guardrail de produção

**Next:**
- Config por rota mais granular (regras combinadas, encadeadas)
- Persistência de config (arquivo local / import-export de cenário)
- Respostas inválidas (payload malformado, schema quebrado)
- Indisponibilidade parcial (dependência específica down, não a API toda)
- CLI pra rodar cenários headless em CI

**Later:**
- Suporte a mais frameworks (NestJS, Koa, Hapi)
- Métricas/export (Prometheus, OpenTelemetry)
- Auth no dashboard + multi-projeto
- Chaos scenarios como código versionado (chaos-as-config em YAML)
- Modo distribuído (múltiplos serviços coordenados)
