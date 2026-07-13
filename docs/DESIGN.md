# Design Spec

Concrete tokens e component rules pro `dashboard-ui`. Draft inicial — ainda não implementado, mas serve de spec pra primeira versão da UI.

## Brand

- Name: Chaos API
- Tone: técnico (monospace em valores/config, não em prosa), direto (sem ilustrações/onboarding longo — dev quer ligar cenário em segundos), alerta-consciente (estado "cenário ativo" sempre visualmente óbvio, nunca sutil — é uma ferramenta que injeta falhas de propósito, o risco de esquecer ligado precisa ser visível)

## Color tokens

| Token | Value | Usage |
|---|---|---|
| `color-bg` | `#0F1115` | fundo da UI (dark, tema técnico/terminal) |
| `color-surface` | `#1A1D24` | cards de cenário, painéis |
| `color-primary` | `#5B8CFF` | ações neutras (links, botão "salvar config") |
| `color-active` | `#FF6B4A` | qualquer cenário LIGADO — cor de alerta, não de sucesso |
| `color-text` | `#E6E8EC` | texto principal |
| `color-text-muted` | `#8A8F98` | labels secundários, timestamps |
| `color-error` | `#E5484D` | erros de config, falha ao conectar no middleware |

## Typography

| Role | Font | Size | Weight |
|---|---|---|---|
| Heading 1 | Inter | 24px | 600 |
| Body | Inter | 14px | 400 |
| Config values (ms, %, regex de rota) | JetBrains Mono | 13px | 400 |

## Spacing scale

4px base: 4 / 8 / 16 / 24 / 32 / 48. Sem valores arbitrários fora da escala.

## Component specs

### Scenario toggle (checkbox)

- Variants: global (afeta todas as rotas), per-route (afeta rota/pattern específico)
- States: off (`color-text-muted` border, sem fill), on (`color-active` fill + label em negrito), disabled (cenário indisponível pro adapter atual — 40% opacity)
- Do: quando ON, mostrar badge com % de requisições afetadas e escopo (rota ou "global") ao lado do checkbox
- Don't: usar `color-primary` pra indicar cenário ativo — reservado pra ações neutras, não pra estado de falha injetada

### Status banner

- Variants: "N cenários ativos" (topo da página, sempre visível ao rolar)
- States: idle (nenhum cenário ativo — banner oculto), active (`color-active` background, texto claro, lista cenários + rotas afetadas)
- Do: banner "active" nunca deve ser dismissable — só some quando último cenário é desligado
- Don't: esconder banner atrás de menu/collapse — visibilidade do estado é o requisito de segurança da UI

### Route scope input

- Variants: campo texto aceitando glob (`/orders/*`) ou regex, com toggle pra "global"
- States: default, invalid pattern (`color-error` border + mensagem inline)
- Do: validar pattern no client antes de habilitar o toggle "on"
- Don't: aplicar cenário com pattern inválido silenciosamente
