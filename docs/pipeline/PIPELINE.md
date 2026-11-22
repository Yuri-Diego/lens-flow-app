# Pipeline de construção do Lens Flow

Este é o roteiro que os agentes seguem até o sistema ficar pronto. Ele é executado pela skill `/pipeline`, e o progresso fica em [STATUS.md](STATUS.md).

| Comando | O que faz |
|---|---|
| `/pipeline status` | Mostra onde estamos e qual é o próximo passo, sem executar nada |
| `/pipeline` | Executa a próxima onda liberada |
| `/pipeline F3` | Executa só a fase F3, se as dependências estiverem prontas |
| `/pipeline auto` | Segue onda após onda e só para em portão, em pergunta ou em falha que não se resolve sozinha |

**Fontes da verdade:**

- [ESPECIFICACAO.md](../produto/ESPECIFICACAO.md): regras (RN-xx) e decisões (Dx/Tx);
- `docs/api/CONTRATO.md`: a API, criado na F2;
- este arquivo: o roteiro.

## 1. Visão geral

| Onda | Fases (em paralelo dentro da onda) | Agentes | Branch da onda | Antes de começar |
|---|---|---|---|---|
| 0 | F0 Pesquisa do ramo ∥ F1 Fundação e CI | pesquisador-sistemas ∥ devops-qa | `chore/onda-0-fundacao` | nada |
| 1 | F2 Backend núcleo: modelos, login, usuários, caixas | backend-api | `feat/onda-1-acesso-e-caixas` | **G0** decisões aprovadas |
| 2 | F3 Backend operação ∥ F4 Base do web | backend-api ∥ frontend-ux | `feat/onda-2-operacao-e-base-web` | F2 em `dev` |
| 3 | F5 Telas de operação | frontend-ux | `feat/onda-3-telas-operacao` | F3 e F4 em `dev` |
| 4 | F6 Telas de administração | frontend-ux | `feat/onda-4-telas-admin` | F5 em `dev` |
| 5 | F7 Testes ponta a ponta e regressão | devops-qa, mais os donos dos bugs | `test/onda-5-e2e` | F6 em `dev` |
| 6 | F8 Revisão: UX ∥ segurança e desempenho | pesquisador-sistemas → frontend-ux ∥ backend-api | `chore/onda-6-revisao` | F7 em `dev` |
| 7 | F9 Release 1.0 | devops-qa | `chore/onda-7-release` | **G-final** e D11 definida |

Fases da mesma onda só rodam em paralelo porque mexem em pastas diferentes. Cada onda gera **um PR para `dev`** com um commit por fase.

## 2. Regras de autonomia

**O orquestrador e os agentes podem fazer sem perguntar:**

- criar branches de trabalho, commitar e dar push nelas;
- abrir PR para `dev`;
- fazer merge em `dev` quando o CI está verde e a revisão passou. Isso vale enquanto o STATUS estiver com "Merge automático em dev: sim".

**Perguntam ao Yuri antes de:**

- qualquer ação em `main` (merge, tag, release);
- mudar uma regra de negócio ou uma decisão Dx;
- mexer nas configurações do repositório no GitHub (proteção de branch, secrets);
- criar contas ou serviços externos (hospedagem, Atlas);
- fazer deploy;
- apagar dados que não sejam de teste;
- adicionar dependência paga.

**Param e chamam o Yuri quando:**

- há um portão pendente;
- um agente faz uma pergunta;
- duas rodadas de correção não resolvem;
- o CI falha por causa externa (conta, cota, segredo).

## 3. Regras globais (vão junto em todo brief)

1. Antes de começar, leia `docs/produto/ESPECIFICACAO.md` e, a partir da F2, `docs/api/CONTRATO.md`.
2. Trabalhe só na sua área:

   | Agente | Área |
   |---|---|
   | backend-api | `lens-flow-backend/` e `docs/api/` |
   | frontend-ux | `lens-flow-web/` |
   | devops-qa | `.github/`, `e2e/`, configs de teste e lint, `package.json` de scripts, `README.md`, `docs/MANUAL.md` |
   | pesquisador-sistemas | `docs/pesquisa/` |

   Se precisar de mudança fora da sua área, descreva no relatório.
3. Não mexa em `lens-flow/` (app Expo congelado, D1).
4. Só o **devops-qa** usa git para branch, commit, push, PR e merge. Os outros só editam arquivos.
5. Regra de negócio em dúvida, ou conflito com a especificação: **não invente**. Devolva a pergunta no relatório.
6. Nenhum segredo vai para arquivo versionado. O `.env` real nunca é lido nem impresso.
7. Interface e mensagens em pt-BR; identificadores em inglês (T7).
8. O relatório final segue o formato da definição do agente e inclui o checklist "Pronto quando" da fase, item a item: ✅, ou ❌ com o motivo.

## 4. Definição de pronto (toda fase)

- Todos os itens "Pronto quando" da fase estão ✅.
- Lint, typecheck (web, a partir da F4), testes e build passam localmente em todo subprojeto tocado.
- Comportamento novo tem teste. Bug corrigido tem teste que falharia antes da correção.
- `docs/api/CONTRATO.md` está atualizado se a API mudou.
- Não sobra log de depuração, código morto nem segredo.
- O PR da onda está aberto para `dev` com CI verde.

## 5. Ciclo de cada onda (o que o orquestrador faz)

1. **Sincronizar.**
   - Rode `git switch dev && git pull --ff-only`. Na onda 0 use `main`, pois `dev` ainda não existe.
   - A árvore deve estar limpa, exceto `docs/pipeline/STATUS.md`. Se não estiver, pergunte ao Yuri e não descarte nada.
2. **Conferir portões.** Toda decisão que bloqueia uma fase da onda precisa estar Aprovada ou Alterada.
3. **Despachar.** Chame um agente por fase, e as fases da onda juntas na mesma mensagem. O brief leva:
   - as regras globais (seção 3);
   - a seção inteira da fase (seção 6);
   - as decisões relevantes;
   - as pendências herdadas, que ficam nas notas do STATUS.
4. **Revisar.**
   - Confira o checklist do relatório contra o código: `git diff --stat`, os arquivos principais e os testes do subprojeto.
   - Se faltar algo, mande ao **mesmo** agente (SendMessage) a lista objetiva do que falta.
   - Depois de 2 rodadas sem resolver, marque a fase como bloqueada e chame o Yuri.
5. **Integrar.** O devops-qa:
   - cria a branch da onda a partir do estado atual;
   - roda tudo;
   - faz um commit por fase, mais `docs:` se houver;
   - dá push e abre o PR para `dev`.
6. **CI e merge.**
   - No app desktop: vincule o PR (ferramentas `ccd_pr`), ofereça o Auto-fix e espere o aviso do CI, sem polling. No terminal: o devops-qa roda `gh pr checks <n> --watch` uma vez.
   - CI verde e revisão OK: o devops-qa faz `gh pr merge --squash --delete-branch`, e depois `git switch dev && git pull --ff-only`.
   - CI vermelho: o devops-qa diagnostica, o dono da fase corrige e o ciclo volta ao passo 5.
7. **Registrar.**
   - Atualize o `STATUS.md`: situação, PR, data, notas e pendências para as próximas fases. Essa alteração entra no commit da onda seguinte.
   - Relate ao Yuri em poucas linhas.

## 6. Fases

### F0 · Pesquisa do ramo (pesquisador-sistemas)

**Objetivo.** Comparar o modelo do produto com o que existe no mercado e embasar as decisões D3 a D9 e o desenho das telas.

**Perguntas:**

1. Como laboratórios de surfaçagem rastreiam serviços em bandejas ou caixas (*job tray tracking*)? Há convenções de cor comuns (urgente, tratamento, montagem)?
2. Que etapas e status os sistemas do ramo (LMS de laboratório ótico, sistemas de ótica) usam? Qual é o mínimo que um laboratório pequeno realmente usa?
3. Como funcionam a saída do serviço e a reutilização da bandeja? Quais são os erros comuns (bandeja trocada, lançamento duplicado, serviço esquecido) e como os sistemas os evitam?
4. Quais são as boas práticas para entrada rápida e conferência em lote no celular (teclado numérico, listas com check, desfazer, ações em lote)?
5. Qual é o volume típico de serviços por dia em laboratórios pequenos e médios? Isso calibra os testes de desempenho.

Se o WebFetch não estiver disponível, use só o WebSearch.

**Saída.** `docs/pesquisa/<AAAA-MM-DD>-rastreamento-de-caixas.md`, no formato do agente, com duas seções a mais:

- "Impacto nas decisões D1 a D14": concorda ou sugere mudar, com evidência;
- "Requisitos para as telas da F5": lista curta.

**Pronto quando:**

- [ ] 5 ou mais sistemas ou fontes analisados, com URL;
- [ ] cada decisão de D3 a D9 comentada;
- [ ] recomendações priorizadas, com o agente que executa;
- [ ] fatos separados de inferências.

### F1 · Fundação e CI (devops-qa)

**Objetivo.** Base para todo o resto: branch `dev`, testes rodando e CI verde.

**Tarefas:**

1. Criar `dev` a partir de `main` e publicar (`git push -u origin dev`).
2. Garantir no `.gitignore`: `.env`, `node_modules`, `dist`, `coverage`, `.claude/settings.local.json`, `playwright-report`, `test-results`.
3. Criar `.nvmrc` na raiz com Node 24, e o campo `engines` no `package.json` do backend e do web.
4. Tornar o backend testável **sem mudar comportamento**:
   - separar `app.js` (monta e exporta o Express) de `server.js` (conecta no banco e escuta);
   - ajustar `npm run dev` e criar `npm start`;
   - adicionar `GET /health`;
   - corrigir B3 (maiúscula no import de `MovementSheet`), sem o que nada roda no Linux.
5. Backend:
   - Vitest + Supertest + `mongodb-memory-server` com `MongoMemoryReplSet` (T6);
   - helper `tests/helpers/db.js` que sobe o banco, limpa entre os testes e derruba no fim;
   - `npm test` = `vitest run`;
   - ESLint (flat config) com `npm run lint`;
   - testes de fumaça: `/health` e um teste de integração que prove que o banco em memória funciona.
6. Web: Vitest + Testing Library + jsdom, com `npm test` = `vitest run`, um teste de fumaça (o App renderiza) e lint passando.
7. Criar `.env.example`:
   - backend: `PORT`, `DATABASE_URL`, `DATABASE_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV`;
   - web: `VITE_API_URL`, se for usado.
8. Criar `.github/workflows/ci.yml`:
   - dispara em `push` e `pull_request` para `dev` e `main`;
   - jobs `backend` e `web` com `npm ci`, lint, test, e build no web;
   - Node lido do `.nvmrc`, com cache de npm;
   - `concurrency` cancelando a execução antiga;
   - `paths` por subprojeto, incluindo o próprio workflow;
   - `lens-flow/` fica fora (D1).
9. Escrever o `README.md` da raiz: como rodar backend e web localmente, os scripts e a estrutura.
10. No relatório, **propor** ao Yuri a proteção de branch em `main` e `dev` exigindo CI verde. Não ative.

O commit da onda 0 inclui também `.claude/agents/`, `.claude/skills/`, `docs/` e `CLAUDE.md` (o commit `docs:`).

**Pronto quando:**

- [ ] `dev` existe no GitHub;
- [ ] `npm run lint` e `npm test` passam no backend e no web;
- [ ] `npm run build` passa no web;
- [ ] o CI está verde no PR da onda 0;
- [ ] não há segredo versionado.

### F2 · Backend núcleo: modelos, login, usuários e caixas (backend-api)

**Objetivo.** O sistema passa a ter dono, usuários e caixas confiáveis. Esta fase fecha S1 a S6, B1, B2, B4 a B11 e B13 (B3 sai na F1).

**Tarefas:**

1. **Modelos** da seção 8 da especificação: `User`, `Box` (cor como chave, categoria derivada, estado, `currentMovement`), `MovementSheet` (`date` único por empresa, sem array), `Movement` (campos novos) e `AuditEvent`.
   - Crie as constantes de cor e categoria num único módulo, `domain/boxColors.js`.
   - Exponha `GET /api/meta/box-colors` com chave, rótulo, categoria e rótulo da categoria. O hex fica no web.
2. Montar todas as rotas sob `/api` (T3).
3. **Login:**
   - `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /auth/password`;
   - JWT em cookie `httpOnly`, `SameSite=Lax`, `Secure` em produção, com validade de 12 h (RN-14);
   - `username` único global, sem distinção de maiúsculas;
   - middlewares `requireAuth` e `requireRole('admin')`;
   - `business` sempre vindo do token;
   - limite de tentativas no login por IP e bloqueio do usuário após 5 erros por 15 min;
   - a mensagem de erro de login é sempre genérica.
4. **Usuários (admin):** listar, criar, editar perfil e nome, desativar e redefinir senha (RN-13). Sem exclusão física. O último admin e o próprio usuário não podem ser desativados.
5. **Script de seed** `npm run seed:admin`: cria a empresa e o primeiro admin, lendo a senha de `SEED_ADMIN_PASSWORD`, nunca de argumento. Pode recusar se já houver admin.
6. **Caixas (admin):**
   - criar (número só com dígitos; par número+cor único, senão 409);
   - criar em lote (`POST /boxes/batch` com `{color, numbers}` que aceita intervalos `27-30`, com resultado item a item);
   - editar (nada muda enquanto a caixa está ocupada, exceto desativar, que é bloqueado com 409);
   - listar para todos os logados, em ordem natural.
7. **Remover** as rotas públicas antigas: `/businesses` inteiro, e `/boxes`, `/movements` e `/movement-sheets` no formato antigo. As operações de serviço voltam na F3.
8. **Base de segurança e erros:**
   - helmet;
   - limite de body de 100 kb;
   - CORS lido de `CORS_ORIGINS`;
   - a API não sobe sem banco ou sem `JWT_SECRET`;
   - middleware de erro no formato da especificação (seção 9);
   - zod em toda entrada, com `.strict()` e validação de ObjectId;
   - recurso de outra empresa responde 404.
9. **Auditoria:** helper `audit(...)` usado em toda mutação desta fase (usuários e caixas).
10. **Contrato:** criar `docs/api/CONTRATO.md` com as rotas da F2 finais (requisição, resposta, erros e exemplos) e as da F3 marcadas como *planejado*, para o web trabalhar em paralelo.
11. O banco de desenvolvimento pode ser zerado (D13). Se houver dados, documente o reset.

**Testes exigidos:**

- login: certo, senha errada, usuário inativo, bloqueio na 6ª tentativa, expiração;
- `/me` com e sem cookie;
- operador recebe 403 nas rotas de admin;
- **isolamento:** caixa de outra empresa responde 404 em todas as rotas;
- caixa: validação de número, cor fora do enum, duplicado com 409, lote com itens repetidos, ordem natural ("2" antes de "10");
- a senha e o hash nunca aparecem em resposta;
- auditoria gravada em cada mutação.

**Pronto quando:**

- [ ] não existe rota de dados sem `requireAuth`;
- [ ] os itens S1–S6 e B1, B2, B4–B11 e B13 estão resolvidos ou não existem mais, com o motivo no relatório;
- [ ] `CONTRATO.md` está criado;
- [ ] `seed:admin` funciona;
- [ ] todos os testes acima passam.

### F3 · Backend operação: folhas, serviços, baixas (backend-api)

**Objetivo.** Implementar o fluxo do papel: lançar, conferir, dar baixa, liberar, corrigir e consultar.

**Tarefas:**

1. **Folha do dia** via upsert por `{business, date}`, com a data calculada no servidor (T8).
2. **`POST /movements`:**
   - em transação, ocupa a caixa (só se estiver livre e ativa);
   - cria o serviço na folha de hoje com `boxSnapshot`;
   - se a caixa estiver ocupada, responde 409 `BOX_OCCUPIED` trazendo cliente, data e autor do serviço que está nela.
3. **Edição, troca e exclusão:**
   - editar (`PATCH`);
   - trocar caixa (`change-box`, atômico);
   - exclusão lógica (`DELETE`, que libera a caixa);
   - tudo com as permissões da RN-11.
4. **Baixa e liberação:**
   - `checkout` e `release-box` (que exige a baixa antes, D6);
   - lote `POST /movements/batch` com `checkout`, `release-box` ou `checkout-and-release`, com resultado item a item e falha parcial permitida;
   - `undo` com janela de 10 min para o autor e sempre para o admin, mas 409 se a caixa já foi reutilizada.
5. **Consultas:**
   - `GET /sheets?from&to`, com contadores por agregação;
   - `GET /sheets/:date`;
   - `GET /movements` com `status`, `color` ou categoria, e `q` (cliente por prefixo ou trecho sem acento, com regex **escapada**; OS exata ou prefixo);
   - `sort=priority` (urgente → mais antigo → número natural), `box` ou `recent`;
   - paginação por cursor;
   - `GET /movements/:id` com o histórico;
   - `GET /audit` para admin, com filtros.
6. **Auditoria** de toda mutação, na mesma transação.
7. **Índices**, confirmados com `explain`, de modo que as consultas principais usem IXSCAN:
   - Movement `{business, status, sheetDate}`, `{business, box, status}`, `{business, clientNameNormalized}`, `{business, orderService}`;
   - Box `{business, state}`;
   - AuditEvent `{business, entityId, at}`.
8. **Script** `npm run seed:demo`: cerca de 1 ano com o volume informado pelo Yuri, ou 60 serviços por dia como padrão. Meça o p95 das listas principais, com meta abaixo de 300 ms (seção 7).
9. Atualizar `CONTRATO.md`: as rotas da F3 deixam de ser *planejado*.

**Testes exigidos:**

- **concorrência:** dois lançamentos simultâneos na mesma caixa, e só um entra;
- regras de baixa, liberação e desfazer, incluindo a janela de 10 min e a caixa reutilizada;
- lote com sucesso parcial;
- ordenação `priority` e ordem natural;
- pendentes atravessando dias;
- **fuso:** lançamento às 23:30 de Brasília cai no dia certo;
- exclusão lógica libera a caixa;
- isolamento entre empresas;
- permissões de operador e admin.

**Pronto quando:**

- [ ] o fluxo completo funciona pela API: lançar → conferir → baixa → liberar → reutilizar a caixa;
- [ ] p95 medido e registrado no relatório;
- [ ] `explain` sem COLLSCAN nas listas;
- [ ] testes passam.

### F4 · Base do web (frontend-ux)

**Objetivo.** Esqueleto do site, primeiro para celular, com login, navegação, design system e tratamento de erro. Roda em paralelo com a F3, usando o contrato.

**Tarefas:**

1. **TypeScript de verdade (T1):** `typescript`, `tsconfig`, `npm run typecheck` (`tsc --noEmit`), arquivos `.tsx` coerentes.
2. **Estrutura:**
   - `src/app` (rotas e layout);
   - `src/features/<auth|sheets|movements|boxes|users>`;
   - `src/components/ui`;
   - `src/lib/api` (axios com `baseURL` `/api`, `withCredentials` e erro normalizado para `{code, message, fields}`);
   - `src/lib/auth` (`AuthProvider`, rota protegida, guarda de perfil).
3. Proxy do Vite `/api` → `http://localhost:5000` e TanStack Query (T2).
4. **Design tokens** no `@theme` do Tailwind:
   - as 6 cores de caixa, parecidas com as físicas;
   - cores de categoria e status;
   - tipografia, espaçamento e anel de foco.
5. **Componente `BoxChip`:** amostra de cor (com borda na branca), número, ícone e rótulo da categoria, e `aria-label` completo. A cor nunca é a única informação.
6. **Layout:**
   - barra inferior no celular (Hoje · Conferência · Buscar · Mais) e barra lateral no computador;
   - cabeçalho com o nome do usuário e **Trocar usuário / Sair** (D12);
   - áreas seguras do iPhone respeitadas.
7. **Login:**
   - usuário e senha com mostrar/ocultar;
   - Enter envia;
   - carregamento com botão desabilitado;
   - erro genérico e mensagem de bloqueio;
   - depois do login, volta para a rota pedida;
   - sessão expirada leva ao login com aviso, mantendo a rota.
8. **Feedback:**
   - toasts com ação **Desfazer**;
   - erro junto do campo (a partir de `fields`);
   - estados vazios e skeletons;
   - faixa de "sem conexão" com botão de tentar de novo.
9. **Remover** o `businessId` e a URL fixos, o menu em inglês e a grade de 3 colunas.
10. Criar páginas vazias com título para cada rota do MVP, para a F5 só preencher.

**Testes exigidos:**

- login: validação, erro exibido, botão desabilitado durante o envio;
- rota protegida redireciona;
- normalização de erro da API;
- `BoxChip` com rótulo acessível que contém a cor e a categoria.

**Pronto quando:**

- [ ] lint, typecheck, testes e build passam;
- [ ] verificado no navegador em 375×812 e no desktop, com o que foi visto descrito no relatório;
- [ ] login real funciona contra a API da F2.

### F5 · Telas de operação (frontend-ux)

**Objetivo.** As telas do dia a dia da seção 6 da especificação (itens 2 a 8), seguindo as recomendações de alta prioridade da F0.

**Tarefas e critérios:**

1. **Hoje:** data, contadores, lista do dia (mais recente primeiro) e **Novo serviço** ao alcance do polegar.
2. **Novo serviço** (meta: até 15 s por lançamento):
   - caixa com teclado numérico e sugestões em tempo real; seleção automática se só uma livre bater; caixa ocupada desabilitada com o motivo;
   - Enter avança entre os campos;
   - **Salvar e próximo** com foco de volta na caixa;
   - toast com **Desfazer**;
   - 409 `BOX_OCCUPIED` explicado com o nome do cliente que está na caixa;
   - nada do que foi digitado se perde em erro;
   - sem envio duplicado.
3. **Conferência:**
   - pendentes agrupados por folha, com dias em aberto e destaque de atraso;
   - ordenação Prioridade, Número da caixa ou Mais antigos;
   - filtros por cor ou categoria e busca por número;
   - checks **Saiu** e **Liberar caixa** (liberar só depois de Saiu);
   - modo seleção com barra fixa "Dar baixa (n)" e "Dar baixa e liberar (n)";
   - UI otimista com rollback;
   - resultado de lote parcial explicado.
4. **Baixas:** por dia, com quem deu baixa e quando, e filtro por período e usuário.
5. **Buscar:** por cliente, OS ou caixa, com o resultado levando ao detalhe.
6. **Detalhe do serviço:** dados, linha do tempo do histórico e ações conforme o perfil (editar, trocar caixa, excluir, desfazer).
7. **Folhas:** lista de dias com contadores, onde tocar abre o dia.

**Testes exigidos:**

- formulário de novo serviço: seleção automática, caixa ocupada, erro por campo, "salvar e próximo" mantendo o foco;
- conferência: lote com falha parcial e ordenação;
- desfazer.

**Pronto quando:**

- [ ] o fluxo completo funciona no navegador em 375×812 contra a API real;
- [ ] o tempo de um lançamento cronometrado e registrado no relatório;
- [ ] lint, typecheck, testes e build passam.

### F6 · Telas de administração (frontend-ux)

**Objetivo.** Itens 9 e 10 da seção 6 da especificação, mais a troca da própria senha.

**Tarefas:**

1. **Caixas:**
   - grade por cor com o estado (a ocupada leva ao serviço);
   - cadastro em lote "cor + números" com intervalos (`3, 12, 27-30`), pré-visualização e resultado item a item;
   - editar e desativar, com erros da API claros.
2. **Usuários:** listar, criar (nome, usuário, senha temporária, perfil), redefinir senha e desativar. Os bloqueios da RN-13 aparecem com mensagem clara.
3. **Minha conta:** trocar a própria senha.
4. Os itens de admin no menu "Mais" só aparecem para admin, e a rota também é protegida.

**Testes exigidos:** lote de caixas (interpretação de intervalos, duplicados), formulário de usuário, guarda de perfil.

**Pronto quando:**

- [ ] verificado em 375×812 e no desktop;
- [ ] operador não vê nem acessa telas de admin;
- [ ] lint, typecheck, testes e build passam.

### F7 · Testes ponta a ponta e regressão (devops-qa, mais os donos dos bugs)

**Objetivo.** Provar o sistema inteiro como o usuário vai usar e travar regressões no CI.

**Tarefas:**

1. Playwright em `e2e/` (T5), com os projetos `mobile` (Pixel 7) e `desktop` (Chromium).
2. Script `npm run start:e2e` no backend:
   - sobe o `MongoMemoryReplSet` e faz o seed de um conjunto fixo: admin, operador, caixas de todas as cores, uma folha de **ontem** com pendentes;
   - a API e o `vite preview` sobem no `webServer` do Playwright.
3. **Cenários:**
   - login, logout e bloqueio por senha errada;
   - operador lança 3 serviços, incluindo um conflito de caixa ocupada;
   - conferência dos pendentes de ontem: baixa, liberação e lote;
   - a caixa liberada é reutilizada;
   - busca;
   - o histórico mostra quem fez o quê;
   - admin cadastra caixas em lote e cria um usuário;
   - operador barrado no admin;
   - sessão expirada.
4. Adicionar o job `e2e` ao CI (em PR para `dev` e `main`), publicando o relatório do Playwright como artefato quando falhar.
5. Rodar a regressão completa. Cada bug vai no relatório com passos, esperado e obtido, e o agente dono, para o orquestrador encaminhar. Repita até ficar verde.

**Pronto quando:**

- [ ] todos os cenários passam nos dois projetos, localmente e no CI;
- [ ] não há teste instável (3 execuções seguidas verdes).

### F8 · Revisão (pesquisador-sistemas → frontend-ux ∥ backend-api)

**8a, UX (pesquisador-sistemas).** Compare o que foi implementado (código das telas e relatórios das F5 e F6) com a pesquisa da F0 e com heurísticas de usabilidade. A saída é `docs/pesquisa/<data>-revisao-ux.md`, com lacunas priorizadas e o agente que executa cada uma.

**8b, segurança e desempenho (backend-api).** Em paralelo com a 8a:

- checklist OWASP ASVS nível 1 aplicável;
- `npm audit`;
- cookies, CORS, helmet e limites de tentativa;
- auditoria imutável;
- segredos e logs sem dados sensíveis;
- desempenho com o `seed:demo`.

Corrija o que for alto ou crítico e registre o resto.

**8c, polimento (frontend-ux).** Depois da 8a:

- implementar os itens de prioridade **alta** da revisão;
- manifesto PWA (ícone e nome, para instalar na tela inicial; sem modo offline);
- passada de acessibilidade (contraste, foco, rótulos);
- bundle principal abaixo de 250 kB gzip.

**Pronto quando:**

- [ ] não sobra item alto ou crítico aberto;
- [ ] regressão E2E verde depois das mudanças.

### F9 · Release 1.0 (devops-qa). Exige G-final e D11 definida

**Tarefas:**

1. Configuração de deploy para a hospedagem escolhida (D11):
   - variáveis de ambiente documentadas;
   - healthcheck;
   - site e API no mesmo site (T3), com `/api` por proxy ou subdomínio.
2. Backup automático do banco configurado ou documentado.
3. `README.md` atualizado e `docs/MANUAL.md`: um manual curto em pt-BR do fluxo papel → sistema, com o passo a passo de lançar, conferir e dar baixa.
4. PR `dev` → `main` **só com o OK do Yuri**, e depois tag `v1.0.0` e notas de versão.
5. Deploy e teste de fumaça (`/health` e página de login) **com o OK do Yuri**. Criar contas e serviços externos é com o Yuri.
6. Recomendação no relatório: uma semana com papel e sistema em paralelo antes de aposentar o papel.

**Pronto quando:**

- [ ] o sistema está no ar com o primeiro admin criado;
- [ ] o manual foi entregue;
- [ ] a tag `v1.0.0` foi criada.

## 7. Portões

- **G0, decisões do produto** (antes da F2). O orquestrador mostra as decisões que estão como *Proposta* na seção 10 da especificação, junto com o que a pesquisa da F0 sugeriu mudar, e pergunta ao Yuri: aprovar todas ou alterar algumas. A resposta é registrada na própria tabela, com a situação Aprovada ou Alterada e a data.
- **G-final, release** (antes da F9). O Yuri confirma que a regressão está verde, define a hospedagem (D11) e autoriza o merge em `main` e o deploy.

## 8. Quando algo foge do roteiro

- **Agente perguntou algo:** o orquestrador pergunta ao Yuri e devolve a resposta ao mesmo agente.
- **Mudança de escopo ou de regra:** registre como nova decisão na especificação (D15 em diante) antes de implementar.
- **Bug encontrado fora da fase:** anote em "Pendências" no STATUS, com o dono. Ele entra no brief da próxima fase desse agente.
- **Depois do MVP:** os itens da seção 13 da especificação viram novas fases (F10 em diante), seguindo o mesmo ciclo.
