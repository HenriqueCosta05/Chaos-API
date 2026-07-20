# ADR-005: Deferir chaos por frame em WebSocket para v1.1

- **Status:** aceita
- **Data:** 2026-07-20

## Contexto

O proxy já suporta upgrade de WebSocket e faz bridging bidirecional de frames
entre cliente e downstream (`copyWebSocket` em `internal/proxy/proxy.go`).
`R-01` (PRD) exige apenas que o upgrade HTTP→WebSocket funcione fim-a-fim, o
que já está implementado e coberto pelo passthrough de proxy.

O que não está implementado é a aplicação de políticas de caos *dentro* da
conexão WebSocket já estabelecida: `copyWebSocket` tem os pontos de extensão
para `latency` e `corrupt` por mensagem, mas eles são no-ops comentados. Isso
foi sinalizado desde a primeira versão do TODO como pendência de alta
complexidade, e o próprio PRD (RK-03) já assume que WebSocket é uma superfície
de risco técnico separada do HTTP.

Diferenças relevantes em relação à aplicação de chaos em HTTP:
- HTTP tem uma única resposta por request; WebSocket é um fluxo contínuo de
  mensagens bidirecionais de vida arbitrariamente longa.
- Aplicar `latency` por mensagem sem quebrar a ordem/backpressure do stream
  exige um scheduler de delay por goroutine de leitura, não apenas um
  `time.Sleep` antes de uma única resposta.
- Aplicar `corrupt` em frames binários vs. texto (JSON, protobuf) tem
  semânticas de "falha realista" bem diferentes, e corromper um frame de
  controle (ping/pong/close) pode derrubar a conexão de formas não
  intencionais, mascarando o que se está tentando testar.
- Não há, hoje, testes de integração para o bridge de WebSocket; adicionar
  mutação de frames sem essa base aumenta a superfície de bugs silenciosos.

Não há prazo ou pedido explícito de cliente/stakeholder pressionando por essa
funcionalidade agora; o risco de fazer isso apressadamente (bugs em conexões
long-lived, que são mais caras de depurar em produção que requests HTTP
avulsos) supera o benefício de entregá-la neste ciclo.

## Decisão

Vamos manter `copyWebSocket` como bridging transparente (passthrough) sem
aplicar `latency`/`corrupt` por frame em v1.0, e documentar isso como
limitação conhecida em vez de deixar como um TODO silencioso no código.
As políticas `latency` e `corrupt` continuam válidas e funcionais para
requests HTTP normais; quando o seletor de uma política casa uma requisição
que faz upgrade para WebSocket, apenas o `error`/`timeout`/`disconnect`
(que agem antes do upgrade) têm efeito -- `latency`/`corrupt` são ignorados
silenciosamente para essa conexão até o upgrade acontecer.

WebSocket frame-level chaos (`latency` e `corrupt` por mensagem) fica
planejado para v1.1, condicionado a: (1) um design de scheduler de delay por
mensagem que não serialize o stream inteiro atrás de um único sleep, e (2)
testes de integração de WebSocket cobrindo o bridge atual antes de adicionar
mutação em cima dele.

## Alternativas consideradas

| Opção | Prós | Contras | Por que não |
|---|---|---|---|
| Implementar agora (delay/corrupt por frame) | Fecha o gap de paridade com HTTP | Complexidade de scheduler + testes ainda não existentes para o bridge base; risco de bug em conexões long-lived | Adiado — sem base de teste para o passthrough atual, mutação em cima dele é arriscada |
| Remover os hooks comentados em `copyWebSocket` | Sem código morto | Perde o ponto de extensão documentado; próximo dev reinventa a mesma decisão sem contexto | Mantemos os hooks como marcador do design pretendido, referenciando esta ADR |
| Documentar limitação e manter passthrough | Escopo v1.0 realista, decisão explícita e rastreável | Usuário que configurar `latency`/`corrupt` numa policy que também casa uma rota WebSocket não vê efeito nela | Escolhida — risco documentado é aceitável; mitigado abaixo |

## Consequências

- `docs/PRD.md` e `docs/TODO.md` devem referenciar esta ADR como a decisão
  formal sobre o item "WebSocket frame-level chaos" antes marcado como
  "decidir se entra no v1.0".
- Operadores que configurem `latency` ou `corrupt` numa política cujo
  seletor também casa uma rota de upgrade WebSocket devem ser avisados (via
  README, já atualizado) que esses efeitos não se aplicam à conexão
  WebSocket em si -- apenas ao request HTTP inicial, se ele não fizer
  upgrade.
- Gera um item de trabalho futuro (v1.1): projetar o scheduler de latência
  por mensagem e a semântica de corrupt por tipo de frame, com testes de
  integração de WebSocket como pré-requisito.
