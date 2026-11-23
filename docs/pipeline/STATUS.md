# Status do pipeline

Atualizado pelo orquestrador (`/pipeline`). Roteiro em [PIPELINE.md](PIPELINE.md).

Situações possíveis: `pendente`, `em andamento`, `em revisão` (PR aberto), `concluída`, `bloqueada` (motivo nas notas).

## Configuração

- Merge automático em `dev` com CI verde e revisão OK: **sim**. Em 2026-11-22, porém, o controle de permissões da sessão barrou o `gh pr merge`. Até o Yuri liberar, cada merge em `dev` espera o OK dele na conversa
- Merge em `main`, tags e deploy: **só com o OK do Yuri**

## Portões

| Portão | Situação | Data | Observação |
|---|---|---|---|
| G0 Decisões do produto aprovadas | aprovado | 2026-11-22 | D3, D5 e as demais aprovadas como propostas. **D4 alterada:** o número da caixa é único na empresa, independente da cor. As novas D15 (níveis de atraso) e D16 (aviso de OS repetida) foram aprovadas. D11 continua pendente até a F9 |
| G-final Release autorizada e D11 definida | pendente | | |

## Fases

| Fase | Onda | Agente(s) | Depende de | Situação | Branch | PR | Notas |
|---|---|---|---|---|---|---|---|
| F0 Pesquisa do ramo | 0 | pesquisador-sistemas | nada | concluída | `chore/onda-0-fundacao` | [#1](https://github.com/Yuri-Diego/lens-flow-app/pull/1) | Concluída em 2026-11-22: `docs/pesquisa/2026-11-22-rastreamento-de-caixas.md`, 59 fontes, D3 a D9 comentadas, recomendações R1 a R22 |
| F1 Fundação e CI | 0 | devops-qa | nada | concluída | `chore/onda-0-fundacao` | [#1](https://github.com/Yuri-Diego/lens-flow-app/pull/1) | Concluída em 2026-11-22. CI verde. Squash em `dev` como cc61138, com o OK do Yuri |
| F2 Backend núcleo | 1 | backend-api | F1, G0 | concluída | `feat/onda-1-acesso-e-caixas` | [#2](https://github.com/Yuri-Diego/lens-flow-app/pull/2) | Concluída em 2026-11-23: squash em `dev` como 4968201, com o OK do Yuri. Despachada em 2026-11-22 a um agente geral (Opus, esforço máximo) seguindo `.claude/agents/backend-api.md`, porque o tipo `backend-api` não estava disponível no turno. Parou no limite de uso da API e com o fim da sessão. Foi retomada em 2026-11-23 a partir do trabalho parcial (modelos, login, usuários e caixas já escritos; faltavam testes e o contrato). Revisada em 2026-11-23: lint limpo, 199 testes em 14 arquivos, `npm audit` sem vulnerabilidades, `docs/api/CONTRATO.md` criado |
| F3 Backend operação | 2 | backend-api | F2 | em andamento | `feat/onda-2-operacao-e-base-web` | | Despachada em 2026-11-23 a um agente geral (Opus, esforço máximo) seguindo `.claude/agents/backend-api.md`. Parou no limite de uso da API e foi retomada às 18h do mesmo dia a partir do trabalho parcial (serviços, folhas, lotes, histórico, `seed:demo`, D18 e testes já escritos). Revisada em 2026-11-23: lint limpo, 390 testes em 21 arquivos, `npm audit` sem vulnerabilidades, contrato atualizado, p95 das listas abaixo de 120 ms com 219 mil serviços |
| F4 Base do web | 2 | frontend-ux | F2 | em andamento | `feat/onda-2-operacao-e-base-web` | | Despachada em 2026-11-23 a um agente geral (Opus, esforço médio) seguindo `.claude/agents/frontend-ux.md`. Revisada em 2026-11-23: lint, typecheck, 49 testes e build passam, `npm audit` sem vulnerabilidades, login real e 375×812 verificados. Aguarda a F3 para a integração |
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
| F0 | F2 | `GET /boxes?number=` devolve a caixa com aquele número, livre ou ocupada; a ocupada traz cliente, autor e data do serviço atual (R1, ajustado pela D4). Criar `GET /boxes/:id` (R19) | backend-api |
| F0 | F3 | `daysOpen` e a data de hoje vindos do servidor (R4); `clientRequestId` idempotente em `POST /movements` e `/movements/batch` (R13); `batchId` e desfazer de lote (R7); filtro "saiu, caixa não liberada" (R15); busca por OS exata ou prefixo, respondendo onde o serviço está (R9); perfis do `seed:demo` com 60, 150 e 600 por dia, Conferência com 300 pendentes e lote de 100 (R18) | backend-api |
| F0 | F4 | R2 (atributos de teclado nos campos base), R10 (amostra de cor sobre fundo neutro, hex tirado de foto das caixas), R16 (troca rápida de usuário), R17 (rascunho preservado quando a sessão expira) | frontend-ux |
| F0 | F5 | Seguir as recomendações R1 a R10 e a seção "Requisitos para as telas da F5" de `docs/pesquisa/2026-11-22-rastreamento-de-caixas.md` | frontend-ux |
| F2 | F3 | **Primeira tarefa da F3 (D18):** guardar o número da caixa exatamente como digitado, sem remover o zero à esquerda. Hoje a F2 normaliza "007" para "7", e o índice único com collation numérica trataria os dois como iguais. Trocar a unicidade para comparação exata, manter a ordem natural na listagem e atualizar testes e `CONTRATO.md` | backend-api |
| F2 | F3 | Testar lançamentos simultâneos na mesma caixa contra `PATCH` e desativação da caixa; `explain` das listas de serviço; D15 com a vermelha lançada hoje já em `normal` (confirmado pelo Yuri) | backend-api |
| F2 | F3 | Alinhar o nome do banco entre `.env.example` (`lens-flow`) e o §6 do `CONTRATO.md` (`lens-flow-dev`). No §6, trocar o exemplo de PowerShell que deixa a senha do seed no histórico pela leitura sem eco que o README usa | backend-api |
| F2 | F4 | Chamar a API por `/api` com o proxy do Vite (o cookie `lf_session` tem `Path=/api`) e manter a origem do Vite em `CORS_ORIGINS`. Tratar `details` e os códigos novos do contrato (`INVALID_CREDENTIALS`, `PAYLOAD_TOO_LARGE`, `DUPLICATE_IN_BATCH`). O logout é público e sempre responde 204 | frontend-ux |
| F2 | F8 | Riscos baixos registrados na F2: enumeração de usuário pelo bloqueio, JWT sem revogação no logout, limites de tentativa em memória por processo, imutabilidade do histórico garantida só pelo Mongoose | backend-api |
| F2 | F9 | Configurar `TRUST_PROXY` atrás de proxy reverso; usuário do banco de produção só com permissão de inserção na coleção do histórico | devops-qa |
| F4 | integração da onda 2 | Acrescentar `npm run typecheck` no job `web` do `.github/workflows/ci.yml` | devops-qa |
| F3 | integração da onda 2 | README: corrigir a linha do nome do banco (o `.env.example` agora usa `lens-flow-dev`) e incluir `seed:demo` na tabela de scripts | devops-qa |
| F3 | F5 | Consumir as mudanças da seção 5.12 do `CONTRATO.md`: `GET /movements/summary` (contadores), `canEdit`, `undo.until` (`null` para admin), `outDate`, `serverDate` e o desfazer de lote por `batchId`. O serviço traz `box` (a caixa em que está) no lugar de `boxSnapshot`, as baixas filtram por `outFrom`/`outTo` e as folhas têm cursor de 31 dias | frontend-ux |
| F3 | F7 | Cenários E2E sugeridos pela F3: fluxo completo no celular; `BOX_OCCUPIED` no "Salvar e próximo"; caixas "7" e "007"; lote parcial e "Desfazer lote"; contagem regressiva do desfazer; lançamento perto da meia-noite; operador barrado ao corrigir o lançamento de outra pessoa ou de outro dia; isolamento entre empresas | devops-qa |
| F3 | F8 | Riscos baixos da F3: lote sequencial (até 100 itens) sem limite de taxa; picos raros de cerca de 0,6 s na busca por trecho (alternativa: índice por início de palavra, se o Yuri aceitar); o `syncIndexes` remove índice criado à mão no banco | backend-api |
| F4 | F5 | Os hex das caixas (`--color-box-*` em `src/index.css`) são provisórios até chegarem as fotos (R10). Opcional: atrasar em cerca de 300 ms o spinner de "Carregando…" ao recarregar | frontend-ux |

## Perguntas abertas para o Yuri

Perguntar antes de despachar a onda 2. Nenhuma bloqueia a integração da onda 1; os padrões abaixo já estão implementados na F2.

| # | Pergunta | Padrão atual | Afeta |
|---|---|---|---|
| P1 | Senha com 8 a 64 caracteres está bom para aparelho compartilhado? | **Respondida em 2026-11-23:** sim (D17) | F4 |
| P2 | Número da caixa sem zero à esquerda ("007" vira "7") e com até 6 dígitos. Alguma etiqueta depende do zero? | **Respondida em 2026-11-23:** o zero importa (D18). A correção entra na F3 | F3, F4, F6 |
| P3 | Um admin pode rebaixar a si mesmo se houver outro admin ativo? | Aberta. Padrão atual: pode. Perguntar antes da F6 | F6 |
| P4 | D15: a caixa vermelha lançada hoje fica com o nível "normal" (sobe um a partir de "neutro")? | **Respondida em 2026-11-23:** sim | F3 |
| P6 | O operador pode trocar a caixa de um serviço aberto nos dias seguintes, na Conferência (R14), ou só no mesmo dia do lançamento? | Aberta. Padrão atual: só no mesmo dia; depois disso, só o admin. Perguntar antes da F5 | F5 |
| P5 | O operador pode abrir a tela de uma caixa (`/caixas/:id`, pelo link direto da R19)? Hoje a tela é só para admin, mas a API já permite a qualquer usuário logado | Aberta. Padrão atual: só admin. Perguntar antes da F6 | F6 |

## Registro

- 2026-11-22: especificação validada contra o código, pipeline e agentes criados. Nada executado ainda.
- 2026-11-22: onda 0 executada. F0 e F1 foram revisadas e integradas no PR #1, com CI verde. G0 aprovado: D4 alterada, D15 e D16 novas. O merge em `dev` foi barrado pelo controle de permissões e esperou o OK do Yuri.
- 2026-11-22: com o OK do Yuri ("Sim, faça o merge"), o PR #1 entrou em `dev` por squash (cc61138), feito pelo orquestrador porque o devops-qa continuou barrado pela permissão. Onda 0 concluída. Próximo passo: onda 1 (F2).
- 2026-11-23: onda 1 concluída. O PR #2 (F2) entrou em `dev` por squash (4968201) com o OK do Yuri. A F2 rodou num agente geral (Opus, esforço máximo) com a definição do backend-api e foi retomada depois do limite de uso. O Yuri confirmou D17 (senha de 8 a 64), D18 (o zero à esquerda importa; correção na F3) e a D15 da vermelha lançada hoje. Próximo passo: onda 2 (F3 ∥ F4).
