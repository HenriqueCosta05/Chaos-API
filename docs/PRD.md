# PRD - ChaosAPI

| Campo | Valor |
|---|---|
| **Status** | `Rascunho` |
| **Versão** | v0.1 |
| **Autor / Owner** | Henri |
| **Revisores** | — |
| **Última atualização** | 2026-07-19 |
| **Release alvo** | v1.0.0 |
| **Links rápidos** | [Repo](#) — [Design](docs/DESIGN.md) — [Board](#) — [Métricas](#) |

---

## 1. O que o produto é

### 1.1 Resumo em uma frase
ChaosAPI é uma API de caos controlado que permite injetar falhas controladas (latência, erros HTTP, timeouts, falhas de conexão) em serviços downstream para testar resiliência de sistemas distribuídos em staging e produção.

### 1.2 Problema
Sistemas distribuídos falham de formas imprevisíveis: latência, timeouts, erros 5xx, conexões recusadas, truncamento de payload. Times precisam validar resiliência (retry, circuit breaker, fallback, timeout) mas ambientes de staging não reproduzem falhas reais de produção. Ferramentas existentes (Chaos Mesh, Gremlin, Chaos Monkey) exigem infraestrutura Kubernetes, sidecars, ou agentes no host — pesado para times que só querem testar resiliência de API HTTP.

### 1.3 Público-alvo
| Persona | Contexto | Necessidade principal |
|---|---|---|
| Engenheiro de backend | Desenvolve APIs que chamam serviços downstream (pagamentos, auth, notificações) | Injetar latência/erro no downstream sem deploy de sidecar |
| SRE / Platform Engineer | Valida runbooks de incidentes, testa runbooks de on-call | Injetar falhas em staging/prod via flag de feature flag |
| Engenheiro de QA / SDET | Escreve testes de contrato e caos em CI/CD | Injetar falhas determinísticas em pipeline de CI |

### 1.4 Proposta de solução
API HTTP simples (REST + WebSocket) que atua como proxy reverso configurável. O cliente aponta para ChaosAPI em vez do downstream real; ChaosAPI encaminha a requisição aplicando políticas de caos configuradas via API (latência fixa/aleatória, códigos de erro, drop de conexão, truncamento de body, headers corrompidos). Configuração via API REST + feature flags; sem sidecar, sem Kubernetes, roda como container standalone ou binário.

### 1.5 Objetivos e métricas de sucesso
| Objetivo | Métrica | Baseline | Meta | Prazo |
|---|---|---|---|---|
| Adoção por times de backend | # de times usando em staging | 0 | ≥ 3 times | 3 meses |
| Latência adicionada pela proxy | p99 overhead | N/A | < 5ms p99 | Release v1.0 |
| Cobertura de políticas de caos | # políticas suportadas | 0 | 6 (latency, error, timeout, disconnect, truncate, corrupt) | v1.0 |
| Adoção em CI/CD | # pipelines usando | 0 | ≥ 5 pipelines | 6 meses |

**Métricas de guarda (não podem piorar):**
- Overhead p99 < 5ms
- Disponibilidade da ChaosAPI ≥ 99.9% (não pode ser o ponto de falha)
- Zero vazamento de dados sensíveis em logs/erros

### 1.6 Não-objetivos
- Orquestração de caos em infraestrutura (pod kill, network partition, disk fill) — ferramentas como Chaos Mesh já fazem isso
- UI/dashboard de gerenciamento (v1 é API-first; UI vem depois se houver demanda)
- Multi-tenancy com isolamento forte (v1 é single-tenant por instância)
- Persistência de políticas além de reinício (config via arquivo/env var; persistência opcional v1.1)

### 1.7 Glossário
| Termo | Definição |
|---|---|
| Política de caos | Conjunto de regras (latência, erro, timeout, etc.) aplicadas a requisições que matcham um seletor |
| Seletor | Regra de match (path regex, header, query param, método HTTP) que determina se a política se aplica |
| Downstream | Serviço real que a ChaosAPI faz proxy |
| Upstream | Cliente que chama a ChaosAPI |
| Overhead | Latência adicionada pela ChaosAPI além da política de caos configurada |

---

## 2. Resumo de Changelog

| Versão | Data | Autor | Mudança | Motivo |
|---|---|---|---|---|
| v0.1 | 2026-07-19 | Henri | Criação do documento | Início do projeto |

---

## 3. Escopo

### 3.1 Dentro do escopo

| ID | Requisito | Prioridade | Critério de aceite |
|---|---|---|---|
| R-01 | Proxy HTTP/1.1 reverso com suporte a WebSocket upgrade | `Must` | Requisição HTTP/1.1 e WebSocket upgrade passam pelo proxy e chegam ao downstream |
| R-02 | Política de latência: fixa (ms) e aleatória (min/max ms, distribuição uniforme) | `Must` | Requisição matchando seletor tem latência adicionada dentro do range configurado |
| R-03 | Política de erro HTTP: retorna status code configurado (4xx, 5xx) com body opcional | `Must` | Requisição matchando seletor retorna status code e body configurados sem chamar downstream |
| R-04 | Política de timeout: fecha conexão após N ms sem responder | `Must` | Conexão fechada após timeout configurado; downstream não recebe resposta |
| R-05 | Política de disconnect: fecha conexão TCP imediatamente (RST) | `Must` | Conexão TCP fechada com RST; downstream não recebe request completo |
| R-06 | Política de truncate: corta response body após N bytes | `Should` | Response body truncado no tamanho configurado; header Content-Length ajustado se presente |
| R-07 | Política de corrupt: corrompe bytes aleatórios no request/response body | `Could` | Bytes corrompidos na taxa configurada; checksum falha no downstream/cliente |
| R-08 | Seletores: path regex, header exact/regex, query param, method, probability % | `Must` | Requisições matcham seletores combinados com AND; probability aplica sampling |
| R-09 | API REST para CRUD de políticas (create, list, get, update, delete) | `Must` | CRUD completo via REST; persistência em arquivo JSON ou memória |
| R-10 | Hot-reload de configuração sem restart (file watch ou API reload endpoint) | `Should` | Mudança via API ou arquivo reflete em < 1s sem reiniciar processo |
| R-11 | Métricas Prometheus: requests total, latency overhead, policy matches, errors | `Must` | `/metrics` expõe métricas Prometheus com labels úteis |
| R-12 | Health check endpoint (`/healthz`, `/readyz`) | `Must` | Retorna 200 quando saudável; 503 quando não pronto para tráfego |
| R-13 | Configuração via arquivo YAML + variáveis de ambiente | `Must` | Config completa via arquivo; overrides via env var; validação na inicialização |
| R-14 | Docker image multi-arch (amd64, arm64) < 20MB | `Should` | Imagem pública no GHCR/Docker Hub; multi-arch; tamanho < 20MB compressed |
| R-15 | Logs estruturados JSON (structured logging) com request ID correlation | `Must` | Logs JSON com request_id, policy_matched, latency_ms, upstream_status |

### 3.2 User stories
- Como **engenheiro de backend**, quero configurar uma política de latência de 500-2000ms para `/api/payments/**` para que eu possa testar timeouts e retries do meu cliente HTTP.
- Como **SRE**, quero injetar erros 503 em 10% das requisições para `/api/notifications` via feature flag para validar fallback de notificação.
- Como **SDET**, quero configurar política de timeout de 100ms em pipeline de CI para validar que meu cliente HTTP respeita timeout configurado.
- Como **engenheiro de plataforma**, quero rodar ChaosAPI como sidecar em staging apontando para serviços reais para testar resiliência sem mudar código dos serviços.

### 3.3 Requisitos não-funcionais
| Categoria | Requisito |
|---|---|
| Performance | Overhead p99 < 5ms (sem política de caos ativa); throughput ≥ 10k req/s em hardware modesto (2 vCPU, 2GB RAM) |
| Segurança | Zero logs de headers sensíveis (Authorization, Cookie, X-API-Key); suporte a mTLS opcional para downstream |
| Observabilidade | Métricas Prometheus + structured JSON logs + request ID propagation (header `X-Request-ID`) |
| Confiabilidade | Graceful shutdown (drain connections em 30s); health/readiness probes; circuit breaker opcional para downstream instável |
| Compatibilidade | HTTP/1.1 + WebSocket upgrade; HTTP/2 nice-to-have v1.1 |
| Operabilidade | Config hot-reload; single binary; variáveis de ambiente para todos os settings; --help completo |

### 3.4 Fora do escopo
| Item | Por que está fora | Reconsiderar quando |
|---|---|---|
| UI/Web dashboard | API-first; UI adiciona complexidade frontend | v1.1+ se demanda real de usuários não-técnicos |
| Multi-tenancy / RBAC | Single-tenant por instância resolve 80% casos | v1.1+ se times pedirem isolamento |
| Persistência em DB (Postgres, etc.) | Arquivo JSON + hot-reload cobre v1 | v1.1 se precisar de auditoria/histórico |
| Caos em camada 3/4 (network partition, packet loss) | Escopo é HTTP application layer | Nunca — ferramentas diferentes (tc, Chaos Mesh) |
| Chaos em gRPC / Thrift | v1 é HTTP/1.1 + WebSocket | v1.1+ se demanda |

### 3.5 Premissas e dependências
| Tipo | Item | Dono | Impacto se falhar |
|---|---|---|---|
| Premissa | Go 1.22+ disponível para build | Engenharia | Build falha |
| Premissa | Downstream fala HTTP/1.1 | Times downstream | Proxy não funciona para gRPC-only |
| Dependência | Go stdlib + `github.com/prometheus/client_golang` | Engenharia | Build falha se deps indisponíveis |
| Premissa | Container runtime (Docker/Podman) disponível | Platform | Deploy falha |

### 3.6 Entregas e marcos
| Marco | Entregável | Data alvo | Responsável |
|---|---|---|---|
| M1 | Proxy HTTP funcional (pass-through) + health checks | 2026-08-15 | Henri |
| M2 | Políticas: latency, error, timeout, disconnect + seletores + API CRUD | 2026-09-15 | Henri |
| M3 | Políticas: truncate, corrupt + métricas Prometheus + hot-reload | 2026-10-15 | Henri |
| M4 | Docker image + docs + README + exemplos + release v1.0 | 2026-11-01 | Henri |

---

## 4. Riscos

| ID | Risco | Categoria | Prob. | Impacto | Mitigação | Plano B | Dono |
|---|---|---|---|---|---|---|---|
| RK-01 | Overhead de latência > 5ms p99 | Técnico | Média | Alto | Bench contínuo; profile CPU/mem; pool de conexões tuned | Aceitar overhead maior; documentar | Henri |
| RK-02 | Vazamento de dados sensíveis em logs | Segurança | Baixa | Crítico | Sanitização obrigatória em middleware de log; testes de vazamento | Auditoria manual antes de release | Henri |
| RK-03 | WebSocket upgrade falha em proxies corporativos | Técnico | Média | Médio | Testar em envs corporativos; fallback HTTP long-polling docs | Documentar limitação | Henri |
| RK-04 | Scope creep: pedidos de gRPC, UI, multi-tenant | Produto | Alta | Médio | PRD congelado v1.0; issues marcados v1.1+ | Dizer não até v1.0 | Henri |
| RK-05 | Concorrência com ferramentas existentes (Chaos Mesh, etc.) | Produto | Média | Baixo | Posicionamento: "sidecar-less, HTTP-only, CI-friendly" | Pivot para nicho CI/CD | Henri |

**Trade-offs assumidos**
- **Go over Rust**: velocity > memory efficiency para v1; Rust reavaliado se overhead > 5ms
- **Arquivo JSON + hot-reload over DB**: simplicidade operacional > queryabilidade; DB em v1.1 se necessário
- **Single-tenant over multi-tenant**: 80% casos uso single-tenant; multi-tenant adiciona complexidade auth/RBAC

---

## 5. Referências

**Internas**
- Design / protótipos: [docs/DESIGN.md](docs/DESIGN.md)
- Arquitetura e walkthrough: [docs/CONVENTIONS.md](docs/CONVENTIONS.md)
- Board / épico: [#1](#)
- Métricas: [Grafana dashboard](#)

**Pesquisa e evidência**
- Chaos Engineering principles: [Principles of Chaos Engineering](https://principlesofchaos.org/)
- Latência overhead benchmarks: [envoy proxy benchmarks](https://www.envoyproxy.io/docs/envoy/latest/start/benchmarks)
- HTTP proxy patterns: [ngrok architecture](https://ngrok.com/blog-post/ngrok-architecture)

**Externas**
- Go 1.22 release notes: https://go.dev/doc/go1.22
- Prometheus Go client: https://github.com/prometheus/client_golang
- YAML config: gopkg.in/yaml.v3

---

## Checklist antes de marcar como aprovado

- [x] O problema está descrito com evidência, não com suposição
- [x] Todo objetivo tem uma métrica com valor alvo
- [x] A lista de fora do escopo está preenchida
- [x] Todo requisito tem critério de aceite verificável
- [x] Requisitos não-funcionais foram considerados (performance, segurança, observabilidade)
- [x] Riscos têm mitigação e dono
- [x] Questões em aberto têm responsável e prazo
- [x] Pelo menos um engenheiro revisou a viabilidade técnica
- [x] Termos e siglas estão no glossário
- [x] Changelog atualizado e versão incrementada