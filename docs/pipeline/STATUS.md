# Status do pipeline

Atualizado pelo orquestrador (`/pipeline`). Roteiro em [PIPELINE.md](PIPELINE.md).

Situações possíveis: `pendente`, `em andamento`, `em revisão` (PR aberto), `concluída`, `bloqueada` (motivo nas notas).

## Configuração

- Merge automático em `dev` com CI verde e revisão OK: **sim**
- Merge em `main`, tags e deploy: **só com o OK do Yuri**

## Portões

| Portão | Situação | Data | Observação |
|---|---|---|---|
| G0 Decisões do produto aprovadas | pendente | | Perguntar depois da onda 0. Levar as perguntas da F0: Q1 (D3, por que duas cores por categoria), Q15 (D4, seleção automática só com uma caixa livre) e Q7 (D5, duas OS na mesma caixa). Levar também as novas propostas D15 (níveis de atraso) e D16 (aviso de OS repetida), que bloqueiam a F3 |
| G-final Release autorizada e D11 definida | pendente | | |

## Fases

| Fase | Onda | Agente(s) | Depende de | Situação | Branch | PR | Notas |
|---|---|---|---|---|---|---|---|
| F0 Pesquisa do ramo | 0 | pesquisador-sistemas | nada | em andamento | `chore/onda-0-fundacao` | | Revisada em 2026-11-22: `docs/pesquisa/2026-11-22-rastreamento-de-caixas.md`, 59 fontes, D3 a D9 comentadas, recomendações R1 a R22. Aguarda a integração |
| F1 Fundação e CI | 0 | devops-qa | nada | em andamento | `chore/onda-0-fundacao` | | `dev` publicada (aa907a0). Revisada em 2026-11-22: lint, testes e build conferidos. Aguarda a integração |
| F2 Backend núcleo | 1 | backend-api | F1, G0 | pendente | `feat/onda-1-acesso-e-caixas` | | |
| F3 Backend operação | 2 | backend-api | F2 | pendente | `feat/onda-2-operacao-e-base-web` | | |
| F4 Base do web | 2 | frontend-ux | F2 | pendente | `feat/onda-2-operacao-e-base-web` | | |
| F5 Telas de operação | 3 | frontend-ux | F3, F4 | pendente | `feat/onda-3-telas-operacao` | | |
| F6 Telas de administração | 4 | frontend-ux | F5 | pendente | `feat/onda-4-telas-admin` | | |
| F7 E2E e regressão | 5 | devops-qa | F6 | pendente | `test/onda-5-e2e` | | |
| F8 Revisão | 6 | pesquisador-sistemas, frontend-ux, backend-api | F7 | pendente | `chore/onda-6-revisao` | | |
| F9 Release 1.0 | 7 | devops-qa | F8, G-final | pendente | `chore/onda-7-release` | | |

## Pendências entre fases

Pendências que uma fase deixou para outra. O orquestrador as inclui no brief do agente dono.

| De | Para | Pendência | Dono |
|---|---|---|---|
| F1 | F2 | Corrigir o B1 (`boxService.updateBox`) e remover o bloco que rebaixa `no-undef` em `lens-flow-backend/eslint.config.js` | backend-api |
| F1 | F2 | Atualizar `tests/db.integration.test.js` quando o modelo `Box` mudar (hoje ele grava a cor em hex) | backend-api |
| F1 | F2 | Rodar `npm audit` no backend e tratar o que for alto ou crítico (são dependências antigas) | backend-api |
| F1 | F4 | Rodar `npm audit` no web e tratar o que for alto ou crítico | frontend-ux |
| F1 | F4 | Se o web passar a usar variáveis de ambiente, criar `lens-flow-web/.env.example` | frontend-ux |
| F0 | F2 | `GET /boxes?number=` devolve as caixas de todas as cores com aquele número, livres e ocupadas; a ocupada traz cliente, autor e data do serviço atual (R1). Criar `GET /boxes/:id` (R19) | backend-api |
| F0 | F3 | `daysOpen` e a data de hoje vindos do servidor (R4); `clientRequestId` idempotente em `POST /movements` e `/movements/batch` (R13); `batchId` e desfazer de lote (R7); filtro "saiu, caixa não liberada" (R15); busca por OS exata ou prefixo, respondendo onde o serviço está (R9); perfis do `seed:demo` com 60, 150 e 600 por dia, Conferência com 300 pendentes e lote de 100 (R18) | backend-api |
| F0 | F4 | R2 (atributos de teclado nos campos base), R10 (amostra de cor sobre fundo neutro, hex tirado de foto das caixas), R16 (troca rápida de usuário), R17 (rascunho preservado quando a sessão expira) | frontend-ux |
| F0 | F5 | Seguir as recomendações R1 a R10 e a seção "Requisitos para as telas da F5" de `docs/pesquisa/2026-11-22-rastreamento-de-caixas.md` | frontend-ux |

## Registro

- 2026-11-22: especificação validada contra o código, pipeline e agentes criados. Nada executado ainda.
