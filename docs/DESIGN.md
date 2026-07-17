# Design Spec

Concrete tokens e component rules pro `dashboard-ui`. Draft inicial — ainda não implementado, mas serve de spec pra primeira versão da UI.

## Marca

- Name: Chaos API
- Tone: técnico (monospace em valores/config, não em prosa), direto (sem ilustrações/onboarding longo — dev quer ligar cenário em segundos), alerta-consciente (estado "cenário ativo" sempre visualmente óbvio, nunca sutil — é uma ferramenta que injeta falhas de propósito, o risco de esquecer ligado precisa ser visível)

## Tokens de cor

| Token | Valor | Uso |
|---|---|---|
| `color-bg` | `#0F1115` | fundo da UI (dark, tema técnico/terminal) |
| `color-surface` | `#1A1D24` | cards de cenário, painéis |
| `color-primary` | `#5B8CFF` | ações neutras (links, botão "salvar config") |
| `color-active` | `#FF6B4A` | qualquer cenário LIGADO — cor de alerta, não de sucesso |
| `color-text` | `#E6E8EC` | texto principal |
| `color-text-muted` | `#8A8F98` | labels secundários, timestamps |
| `color-error` | `#E5484D` | erros de config, falha ao conectar no middleware |

## Tipografia

| Papel | Fonte | Tamanho | Peso |
|---|---|---|---|
| Título 1 | Inter | 24px | 600 |
| Corpo | Inter | 14px | 400 |
| Valores de config (ms, %, regex de rota) | JetBrains Mono | 13px | 400 |

## Escala de espaçamento

4px base: 4 / 8 / 16 / 24 / 32 / 48. Sem valores arbitrários fora da escala.

## Especificação de componentes

### Toggle de cenário (checkbox)

- Variantes: global (afeta todas as rotas), per-route (afeta rota/pattern específico)
- Estados: off (`color-text-muted` border, sem fill), on (`color-active` fill + label em negrito), disabled (cenário indisponível pro adapter atual — 40% opacity)
- Fazer: quando ON, mostrar badge com % de requisições afetadas e escopo (rota ou "global") ao lado do checkbox
- Não fazer: usar `color-primary` pra indicar cenário ativo — reservado pra ações neutras, não pra estado de falha injetada

### Banner de status

- Variantes: "N cenários ativos" (topo da página, sempre visível ao rolar)
- Estados: idle (nenhum cenário ativo — banner oculto), active (`color-active` background, texto claro, lista cenários + rotas afetadas)
- Fazer: banner "active" nunca deve ser dismissable — só some quando último cenário é desligado
- Não fazer: esconder banner atrás de menu/collapse — visibilidade do estado é o requisito de segurança da UI

### Campo de escopo de rota

- Variantes: campo texto aceitando glob (`/orders/*`) ou regex, com toggle pra "global"
- Estados: default, invalid pattern (`color-error` border + mensagem inline)
- Fazer: validar pattern no client antes de habilitar o toggle "on"
- Não fazer: aplicar cenário com pattern inválido silenciosamente
