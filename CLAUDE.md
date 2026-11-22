# Lens Flow

Site para um laboratório de surfaçagem controlar os serviços por caixas. Ele substitui a planilha de papel: há uma folha por dia, a baixa é dada no dia seguinte e a caixa é liberada em seguida. Cada usuário tem login próprio e tudo registra quem fez.

## Onde está cada coisa

| Documento | Para que serve |
|---|---|
| `docs/produto/ESPECIFICACAO.md` | Regras do produto (RN-xx) e decisões (Dx/Tx). **Fonte da verdade** |
| `docs/pipeline/PIPELINE.md` | Roteiro de construção |
| `docs/pipeline/STATUS.md` | Progresso do pipeline |
| `docs/api/CONTRATO.md` | Contrato da API (a partir da F2) |

Para executar o pipeline, use `/pipeline` (ou `/pipeline status`).

## Estrutura

| Pasta | O que é |
|---|---|
| `lens-flow-backend/` | API Node/Express + MongoDB (Mongoose) |
| `lens-flow-web/` | O produto: site React + Vite + Tailwind, pensado primeiro para celular |
| `lens-flow/` | App Expo **congelado** (D1). Não alterar |

## Agentes do projeto (`.claude/agents/`)

- `frontend-ux`: telas e UX;
- `backend-api`: API, dados e segurança;
- `devops-qa`: testes, CI, branches, commits e PRs;
- `pesquisador-sistemas`: pesquisa do ramo e recomendações de UX.

Só o `devops-qa` faz branch, commit, push, PR e merge.

## Convenções

- Interface e mensagens em pt-BR; identificadores em inglês. Fuso `America/Sao_Paulo`, com a data calculada no servidor.
- Branches: `main` ← `dev` ← `feat/*`, `fix/*`, `test/*`, `chore/*`. Os PRs vão sempre para `dev`, e `main` só com o OK do Yuri.
- O `.env` real nunca é lido nem impresso. Segredos ficam só em variáveis de ambiente, e cada subprojeto que usa variáveis de ambiente tem um `.env.example`.
