# Deployment

Chaos API é um pacote npm + ferramenta de dev local — não há ambiente hospedado (dev/staging/prod) pra este projeto. "Deploy" aqui significa publicar o pacote no npm.

## Ambientes

| Ambiente | URL | Gatilho de deploy |
|---|---|---|
| npm registry (público) | `https://www.npmjs.com/package/@henriquecosta/chaos-api` | tag `v*` na branch principal, via CI |

## Permissões necessárias

- Acesso de publish no escopo `@henriquecosta` no npm — necessário pra `npm publish`
- Permissão de criar tags/releases no repositório — necessário pra disparar o pipeline de publish

## Etapas do pipeline

1. Lint + typecheck — bloqueia merge se falhar
2. Test (unit + integration) — bloqueia merge se falhar
3. Build — compila `application/src` pra `dist/`, gera types
4. Publish — só roda em tag `v*`, publica `dist/` no npm com `NPM_TOKEN`

## Variáveis de ambiente / secrets

| Nome | Onde configurado | Finalidade |
|---|---|---|
| `NPM_TOKEN` | CI secrets | autenticação pra `npm publish` |

## Reversão (rollback)

Pacote com bug publicado: `npm deprecate @henriquecosta/chaos-api@<versão> "mensagem"` pra sinalizar a versão ruim, seguido de publish de patch corrigido. Não usar `npm unpublish` além da janela de 72h do npm (quebra quem já instalou).
