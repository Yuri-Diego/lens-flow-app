# Lens Flow: especificação do produto

Versão 0.3, 2026-11-23: decisões do portão G0 (22/11), mais D17 e D18, aprovadas pelo Yuri. É a fonte da verdade das regras do sistema. Uma regra só muda com uma decisão do Yuri registrada na seção 10.

## 1. Objetivo

Substituir a planilha de papel em que o laboratório de surfaçagem acompanha os serviços por um site com acesso restrito. O site precisa funcionar bem no celular e permitir:

- dar entrada nos serviços do dia, cada um em uma caixa;
- no(s) dia(s) seguinte(s), conferir se o serviço saiu ("dar baixa") e liberar a caixa;
- ver as baixas e o histórico, sabendo **quem fez cada movimentação e quando**.

## 2. Papel hoje, sistema amanhã

| Hoje (papel) | No Lens Flow |
|---|---|
| Uma folha por dia | **Folha** do dia, criada sozinha no primeiro lançamento |
| Cada linha: caixa, cliente, OS | **Serviço** lançado em uma **caixa** livre |
| No dia seguinte, check "saiu" | **Baixa** do serviço (quem/quando) |
| Check na caixinha para liberar | **Liberar caixa**: ela volta a ficar livre |
| Não dá para saber quem anotou | Login individual, e toda ação fica no **histórico** |

## 3. Glossário (interface em pt-BR, código em inglês)

| Termo na tela | No código | Significado |
|---|---|---|
| Empresa | `Business` | O laboratório (dono dos dados) |
| Usuário | `User` | Pessoa com login e senha próprios |
| Caixa | `Box` | Bandeja física: número + cor |
| Categoria | `category` | Tipo de serviço, definido pela cor da caixa |
| Folha | `MovementSheet` | O dia de trabalho (`date` = `AAAA-MM-DD`) |
| Serviço | `Movement` | Um trabalho lançado em uma caixa |
| Baixa / "Saiu" | `checkout` (`status: out`) | O serviço saiu do laboratório |
| Liberar caixa | `releaseBox` | A caixa volta a ficar livre |
| Pendente | `status: open` | Serviço lançado e ainda sem baixa |
| Histórico | `AuditEvent` | Registro imutável de quem fez o quê |

## 4. Regras de negócio

- **RN-01 Acesso.** Toda tela e toda rota da API exigem login. Cada pessoa tem usuário e senha próprios. Não existe cadastro aberto: o admin cria as contas (D2).
- **RN-02 Rastreabilidade.** Toda criação, alteração, baixa, liberação, desfazer e exclusão grava quem fez, quando, e o antes e depois. Esse histórico não pode ser editado nem apagado.
- **RN-03 Caixa.** Uma caixa tem número (só dígitos, sem sequência) e cor (`branca`, `preta`, `verde`, `amarela`, `vermelha` ou `azul`). O número é único na empresa, independente da cor: não existem duas caixas com o mesmo número (D4). Ele é guardado exatamente como na etiqueta, com até 6 dígitos: o zero à esquerda importa, então "007" e "7" são caixas diferentes (D18).
- **RN-04 Cor define a categoria.** A categoria nunca é escolhida à mão: ela vem da caixa.

  | Cor | Categoria |
  |---|---|
  | Branca, Preta | Sem montagem |
  | Verde, Amarela | Com montagem |
  | Vermelha | Urgente |
  | Azul | Com tratamento |

- **RN-05 Ocupação.** A caixa fica `livre` ou `ocupada`. Cada caixa recebe um serviço aberto por vez (D5). Caixa inativa (perdida ou quebrada) não recebe serviço. Dois lançamentos simultâneos na mesma caixa: só um entra, e o outro recebe erro claro.
- **RN-06 Folha do dia.** Existe uma folha por dia por empresa, criada automaticamente no primeiro lançamento. O dia é o do **servidor** no fuso `America/Sao_Paulo`, nunca o relógio do aparelho.
- **RN-07 Lançamento.** Caixa (livre) e cliente são obrigatórios. OS e observação são opcionais (D14). Lançar ocupa a caixa.
- **RN-08 Baixa.** Marca o serviço como saído e grava quem e quando. Pode ser feita em qualquer dia depois do lançamento, inclusive no mesmo dia.
- **RN-09 Liberar caixa.** Só é possível depois da baixa (D6). A caixa volta a ficar livre. "Saiu e liberar" em um toque é a ação principal da Conferência, também em lote (D6).
- **RN-10 Pendências.** Um serviço aberto aparece na **Conferência** até receber baixa, com "dias em aberto" e nível de atraso calculado pelo servidor (D15): lançado hoje é neutro, de ontem é normal, com 2 dias pede atenção e com 3 ou mais está atrasado. A caixa vermelha (urgente) sobe um nível antes: lançada hoje, ela já aparece como normal. O nível aparece sempre com texto e ícone, nunca só pela cor. A ordem padrão é: urgente (vermelha) primeiro, depois o mais antigo, depois o número da caixa em ordem natural ("2" antes de "10"). Também é possível ordenar só pelo número da caixa, seguindo a prateleira.
- **RN-11 Correções** (D9):
  - o operador edita ou exclui o **próprio** lançamento no mesmo dia;
  - o operador desfaz a própria baixa ou liberação em até 10 minutos, desde que a caixa não tenha sido reutilizada;
  - o admin corrige qualquer coisa;
  - a exclusão é lógica (o registro some da tela, mas continua no histórico) e libera a caixa;
  - um lote de baixas ou liberações pode ser desfeito inteiro, com as mesmas regras (D9).
- **RN-12 Trocar caixa.** Trocar a caixa de um serviço aberto libera a antiga e ocupa a nova numa única operação.
- **RN-13 Administração.** O admin cadastra caixas (também em lote: "vermelha: 3, 12, 27-30"), cria e desativa usuários, redefine senhas e vê o histórico geral. Ninguém desativa a si mesmo nem o último admin.
- **RN-14 Sessão.** A sessão expira em 12 h. O botão "Trocar usuário" fica sempre visível, para aparelho compartilhado (D12). A senha tem de 8 a 64 caracteres (D17). Cinco senhas erradas bloqueiam o usuário por 15 min.
- **RN-15 OS repetida** (D16). Ao lançar uma OS que já está num serviço aberto, o sistema avisa e mostra onde ela está, mas não impede o lançamento.

## 5. Perfis e permissões

| Ação | Operador | Admin |
|---|---|---|
| Lançar serviço, dar baixa, liberar caixa (também em lote) | Sim | Sim |
| Editar ou excluir lançamento | Só o próprio, no mesmo dia | Sempre |
| Desfazer baixa ou liberação | Só a própria, até 10 min | Sempre (se a caixa não foi reutilizada) |
| Ver folhas, pendências, baixas, busca, histórico do serviço | Sim | Sim |
| Cadastrar, editar e desativar caixas | Não | Sim |
| Gerenciar usuários e ver o histórico geral | Não | Sim |
| Trocar a própria senha | Sim | Sim |

## 6. Telas do MVP (site, pensado primeiro para celular)

No celular, a navegação fica numa barra inferior: **Hoje · Conferência · Buscar · Mais**. No computador ela vira uma barra lateral.

1. **Login.** Usuário, senha (com mostrar/ocultar) e Enter para entrar. O erro é genérico ("usuário ou senha inválidos"), com aviso de bloqueio.
2. **Hoje.** Data e contadores (lançados hoje, pendentes de dias anteriores), a lista do dia e o botão **Novo serviço** ao alcance do polegar.
3. **Novo serviço.** O fluxo mais importante. Meta: **até 15 s por lançamento**.
   - O campo da caixa usa teclado numérico. Como o número é único (D4), digitar o número já identifica a caixa, que aparece com cor e categoria.
   - Se a caixa estiver livre, ela é escolhida sozinha. Se estiver ocupada, aparece desabilitada com "ocupada por Fulano desde dd/mm".
   - Uma OS que já está num serviço aberto gera aviso, sem bloquear (D16).
   - Depois vêm cliente, OS e observação. Enter avança para o próximo campo.
   - **Salvar e próximo** mantém a tela aberta para o próximo lançamento. Aparece um aviso "Desfazer".
   - Se der erro, nada do que foi digitado se perde.
4. **Conferência.** Todos os pendentes, agrupados por folha, com dias em aberto e filtros por cor ou categoria.
   - Cada linha tem os checks **Saiu** e **Liberar caixa**, a ação principal **Saiu e liberar** em um toque e o nível de atraso (D15).
   - No modo seleção, uma barra fixa oferece "Dar baixa (n)" e "Dar baixa e liberar (n)".
   - Num lote com falhas, o sistema mostra o que deu certo e o que não deu.
5. **Baixas.** Serviços que saíram, por dia, com quem deu baixa e quando.
6. **Buscar.** Por cliente, OS ou número da caixa, cobrindo todos os dias.
7. **Detalhe do serviço.** Os dados e uma linha do tempo ("Lançado por Ana 08:12 · Baixa por João 23/11 09:03 · Caixa liberada por João 09:04"), mais as ações permitidas ao perfil.
8. **Folhas.** Lista de dias com contadores. Tocar em um dia abre aquela folha.
9. **Caixas (admin).** Grade por cor com o estado de cada caixa (a ocupada leva ao serviço), cadastro em lote, edição e desativação.
10. **Usuários (admin).** Criar, redefinir senha, desativar e definir o perfil.

A cor nunca é a única informação: cada caixa aparece como amostra de cor (com borda, para a branca), número, rótulo da categoria e ícone.

## 7. Requisitos não funcionais

- **Celular primeiro:** funciona a partir de 360 px de largura, com alvos de toque de 44 px ou mais e sem rolagem horizontal. Deve rodar em Chrome Android e Safari iOS recentes e poder ser instalado na tela inicial (manifesto PWA).
- **Idioma e fuso:** pt-BR, `America/Sao_Paulo`.
- **Desempenho:** API com p95 abaixo de 300 ms nas listas com 1 ano de dados (cerca de 20 mil serviços). Primeira carga do site rápida em 4G.
- **Acessibilidade:** contraste WCAG AA, rótulos em todos os ícones e uso completo pelo teclado no computador.
- **Segurança:**
  - senhas com bcrypt;
  - sessão em cookie `httpOnly`, `Secure` e `SameSite`;
  - limite de tentativas de login;
  - dados sempre filtrados pela empresa do token;
  - validação de toda entrada;
  - nenhum segredo no repositório.
- **Confiabilidade:** a API não sobe sem banco ou sem `JWT_SECRET`. O banco de produção precisa de backup automático.

## 8. Modelo de dados proposto

- **User**: `business`, `name`, `username` (único, minúsculo), `passwordHash`, `role` (`admin` | `operator`), `active`, `failedLogins`, `lockedUntil`, `lastLoginAt`, timestamps.
- **Box**: `business`, `number` (string de dígitos), `color` (enum da RN-03), `category` (derivada da cor), `state` (`free` | `occupied`), `currentMovement` (ou `null`), `active`, timestamps. Índice único `{business, number}` com comparação exata, sem collation numérica, para "007" e "7" serem caixas diferentes (D4, D18). A ordem natural da listagem fica num índice ou critério separado.
- **MovementSheet**: `business`, `date` (`AAAA-MM-DD`), timestamps. Índice único `{business, date}`. Sem array de movimentos, que cresceria sem limite: os serviços apontam para a folha.
- **Movement**: `business`, `sheet`, `sheetDate`, `box`, `boxSnapshot {number, color, category}`, `clientName`, `orderService`, `note`, `status` (`open` | `out`), `createdBy`, `outBy`, `outAt`, `boxReleasedBy`, `boxReleasedAt`, `updatedBy`, `deletedBy`, `deletedAt`, timestamps.
- **AuditEvent**: `business`, `user`, `action`, `entity`, `entityId`, `before`, `after`, `at`. Somente inserção.
- **MovementBatch** (F3): registro de cada lote de baixa ou liberação, com o que foi feito em cada item, para o desfazer do lote inteiro (D9) e a idempotência por usuário.
- **Campos técnicos da F3:** `Movement` ganhou `urgent`, `boxSortKey`, `clientNameNormalized`, `clientRequestId` (lançamento idempotente) e `outDate`, e `Box` ganhou `lastMovement` (para saber se a caixa foi reutilizada). O formato exato de cada resposta está em `docs/api/CONTRATO.md`.

Operações que mexem em caixa e serviço juntos (lançar, trocar caixa, liberar, excluir, desfazer) rodam em **transação**: MongoDB em replica set, com Atlas em produção e `MongoMemoryReplSet` nos testes.

## 9. Contrato de API (rascunho)

A fase F2 transforma este rascunho em `docs/api/CONTRATO.md`, que passa a ser a fonte da verdade. Todas as rotas ficam sob o prefixo `/api`: o Vite faz o proxy no desenvolvimento e o servidor web no deploy (T3). Todas, menos o login e o `/health`, exigem sessão.

- **Formato de erro:** `{ "error": { "code": "...", "message": "texto pt-BR", "fields": { "campo": "mensagem" } } }`.
- **Códigos de erro:** `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404 (inclusive para recurso de outra empresa), `BOX_OCCUPIED` 409, `CONFLICT` 409, `RATE_LIMITED` 429, `INTERNAL` 500.

| Método e rota | Quem | Faz |
|---|---|---|
| `POST /auth/login` | público | Entra com `{username, password}`. Responde com o cookie de sessão e `{user}` |
| `POST /auth/logout` · `GET /auth/me` · `PATCH /auth/password` | logado | Sair, sessão atual, trocar a própria senha |
| `GET/POST /users` · `PATCH /users/:id` · `POST /users/:id/reset-password` | admin | Gestão de usuários |
| `GET /boxes?state=&color=&number=` | logado | Lista em ordem natural de número. Caixas ocupadas trazem o resumo do serviço (cliente, autor e data) |
| `POST /boxes` · `POST /boxes/batch` · `PATCH /boxes/:id` | admin | Cadastrar (também em lote), editar, desativar |
| `GET /sheets?from=&to=` · `GET /sheets/:date` | logado | Dias com contadores; serviços de um dia |
| `POST /movements` | logado | Lançar na folha de hoje: ocupa a caixa de forma atômica, ou responde 409 `BOX_OCCUPIED`. Uma OS repetida volta como aviso na resposta (D16) |
| `GET /movements?status=&sort=priority\|box\|recent&q=&color=&cursor=` | logado | Pendentes, baixas, busca (paginação por cursor) |
| `GET /movements/:id` | logado | Detalhe com histórico |
| `PATCH /movements/:id` · `DELETE /movements/:id` | autor no dia / admin | Editar; exclusão lógica que libera a caixa |
| `POST /movements/:id/change-box` | autor no dia / admin | Trocar caixa de forma atômica |
| `POST /movements/:id/checkout` · `POST /movements/:id/release-box` | logado | Baixa; liberar caixa |
| `POST /movements/batch` `{ids, action}` | logado | Ações `checkout`, `release-box` ou `checkout-and-release`, com resultado item a item |
| `POST /movements/:id/undo` `{action}` | autor até 10 min / admin | Desfazer baixa ou liberação |
| `GET /audit?user=&from=&to=` | admin | Histórico geral |
| `GET /health` | público | Verificação de saúde |

## 10. Decisões do produto

Situação: **Proposta** (padrão sugerido, falta o OK do Yuri), **Aprovada**, **Alterada** ou **Pendente** (sem padrão). O portão G0 foi aprovado pelo Yuri em 2026-11-22.

| ID | Decisão | Regra em vigor | Situação | Bloqueia |
|---|---|---|---|---|
| D1 | Plataforma | Só o site (`lens-flow-web`), primeiro para celular e instalável. O app Expo (`lens-flow/`) fica congelado | Aprovada 2026-11-22 | F4 |
| D2 | Acesso | Login individual com usuário e senha. Admin cria as contas. O primeiro admin é criado por script | Aprovada 2026-11-22 | F2 |
| D3 | Branca = preta e verde = amarela? | Sim, mesma regra. A cor diferente só identifica a caixa física | Aprovada 2026-11-22 | F2 |
| D4 | Número da caixa | Único na empresa, **independente da cor**: não há duas caixas com o mesmo número. Digitar o número identifica a caixa; a ocupada aparece desabilitada com cliente, autor e data | Alterada 2026-11-22 (a proposta era "único por cor") | F2 |
| D5 | Serviços por caixa | Um serviço aberto por caixa | Aprovada 2026-11-22 | F2 |
| D6 | Baixa e liberação | Dois checks separados (Saiu / Caixa liberada). "Saiu e liberar" em um toque é a ação principal, também em lote. Liberar só depois de Saiu | Aprovada 2026-11-22 | F3 |
| D7 | Etapas intermediárias (surfaçagem/tratamento/montagem) | Fora do MVP: só aberto → saiu | Aprovada 2026-11-22 | F2 |
| D8 | Serviço que não sai no dia seguinte | Continua na Conferência com dias em aberto e nível de atraso (D15) | Aprovada 2026-11-22 | F3 |
| D9 | Correções | Conforme RN-11, com desfazer de lote inteiro | Aprovada 2026-11-22 | F3 |
| D10 | Várias empresas | Uma empresa no MVP, mas com os dados já separados por empresa | Aprovada 2026-11-22 | F2 |
| D11 | Hospedagem | A definir antes da F9. Sugestão: site e API no mesmo domínio (o cookie de sessão funciona no iPhone) e MongoDB Atlas com backup | Pendente | F9 |
| D12 | Aparelho compartilhado | Sim: "Trocar usuário" sempre visível e sessão de 12 h | Aprovada 2026-11-22 | F4 |
| D13 | Dados atuais do banco | São de teste: dá para mudar o esquema e zerar o banco de desenvolvimento | Aprovada 2026-11-22 | F2 |
| D14 | Campos do serviço | Caixa e cliente obrigatórios; OS e observação opcionais | Aprovada 2026-11-22 | F2 |
| D15 | Níveis de atraso | Hoje = neutro; ontem = normal; 2 dias = atenção; 3 ou mais = atrasado; a vermelha sobe um nível antes, e lançada hoje já fica normal. Calculado no servidor, sempre com texto e ícone | Aprovada 2026-11-22 (sugerida pela F0); vermelha de hoje confirmada em 2026-11-23 | F3 |
| D16 | OS repetida | Lançar uma OS que já está num serviço aberto gera aviso com o lugar dela, sem bloquear | Aprovada 2026-11-22 (sugerida pela F0) | F3 |
| D17 | Tamanho da senha | De 8 a 64 caracteres | Aprovada 2026-11-23 | F4 |
| D18 | Zero à esquerda no número da caixa | O número é guardado como na etiqueta: "007" e "7" são caixas diferentes. Só dígitos, até 6 | Aprovada 2026-11-23 (a F2 removia o zero; corrigir na F3) | F3, F4, F6 |

## 11. Decisões técnicas (os agentes seguem; mudam por boa razão registrada no relatório)

- **T1** O web passa a usar TypeScript de verdade (`tsconfig` e `tsc --noEmit` no CI).
- **T2** TanStack Query para dados no web: cache, mutações e UI otimista com rollback.
- **T3** Sessão em cookie `httpOnly`. Em produção, site e API ficam no mesmo site, por proxy `/api` ou subdomínio do mesmo domínio, para o Safari não bloquear o cookie.
- **T4** Vitest + Supertest no backend; Vitest + Testing Library no web.
- **T5** Playwright para E2E, com projeto celular (Pixel 7) e projeto desktop.
- **T6** Transações MongoDB nas operações de caixa e serviço (RN-05, RN-12).
- **T7** Identificadores em inglês, textos de interface e mensagens de erro em pt-BR.
- **T8** A data da folha é calculada no servidor com `Intl`, no fuso `America/Sao_Paulo`, sem `-03:00` fixo.

## 12. Validação do código atual (2026-11-22)

**Conclusão:** a ideia é coerente e cabe na estrutura que já existe (Business → Box → Movement → MovementSheet). Mas falta todo o núcleo de acesso (usuários, login, auditoria) e o código tem falhas graves de segurança e bugs que impedem o fluxo. O backend será reestruturado, não remendado.

**Aproveitar:** a arquitetura em camadas `routes → controllers → services → models`, as dependências já instaladas (zod, bcrypt, jsonwebtoken, cookie-parser), a ideia de ordenação natural por collation `numericOrdering`, o setup de Tailwind 4 e lucide no web, e o conceito visual do `BoxCard`.

**Segurança (crítico):**

- S1. Nenhuma rota exige login: qualquer pessoa cria e apaga caixas, serviços e empresas.
- S2. `GET /businesses` devolve todas as empresas **com o hash da senha**.
- S3. O `businessId` vem da URL ou do body (`/movement-sheets/today/:businessId`) e está fixo no front (`MovementList.tsx`).
- S4. `PUT /movements/status/:id` grava o body inteiro (atribuição em massa).
- S5. `searchBoxesByNumber` monta `RegExp` com a entrada do usuário (injeção/ReDoS) e não filtra por empresa.
- S6. Body de até 20 MB, CORS fixo em localhost, e `connectDB` engole o erro, então a API sobe sem banco.

**Bugs:**

- B1. `boxService.updateBox` usa a variável inexistente `update`, então toda edição de caixa quebra.
- B2. `createBox` valida `number` com `z.number()`, mas o modelo guarda String. A verificação de duplicidade é global, entre todas as empresas, e não por empresa.
- B3. `movementSheetService.js` importa `../models/movementSheet.js`, mas o arquivo é `MovementSheet.js`. Funciona no Windows e **quebra no Linux** (CI e deploy).
- B4. `getMovementSheetWithMovements` passa o model em vez do documento e sempre devolve lista vazia.
- B5. A folha do dia é achada por intervalo de `createdAt`. Nada impede duas folhas no mesmo dia.
- B6. `Movement.updateAt` tem erro de digitação, e o middleware grava `updatedAt`, que é descartado.
- B7. `updateDataMovement` grava `boxId`, campo que não existe. A troca de caixa não funciona e não libera a caixa antiga.
- B8. `deleteBusiness` não retorna nada, então a rota sempre responde 404.
- B9. `getMovementsByBoxNumber` dá 500 quando a caixa não existe.
- B10. Erros de validação saem como 500, sem formato padrão.
- B11. `movementService` e `movementSheetService` se importam mutuamente (import circular).
- B12. No web:
  - mistura `.jsx` e `.tsx` sem TypeScript configurado: importa `BoxCard.jsx` para um arquivo `.tsx`; o Vite resolve e o `vite build` passa (testado em 2026-11-22), mas ninguém checa tipos;
  - a URL da API está fixa no código;
  - a grade tem 3 colunas fixas, inviável no celular;
  - o menu tem rotas inexistentes e textos em inglês.
- B13. Não existem usuários, nem registro de quem fez o quê, nem estado livre/ocupada nas caixas.
- B14. As cores estão gravadas como hex no banco (o azul atual é quase cinza). O banco deve guardar a **chave** da cor; o hex é decisão de design no web e deve bater com as caixas físicas.

**Testes e CI:** não há nenhum teste no backend nem no web, não há CI, nem `.env.example`.

**App Expo:** só telas de modelo; o login não chama a API.

## 13. Fora do MVP (backlog)

Etapas de produção (surfaçagem, tratamento, montagem); imprimir ou exportar a folha (PDF/CSV); QR ou código de barras na caixa; modo offline com fila de envio; alertas de atraso; painel de produtividade por usuário; app Expo; várias empresas com cobrança.

## 14. Perguntas em aberto (não bloqueiam a F2)

Vêm da pesquisa da F0 (`docs/pesquisa/2026-11-22-rastreamento-de-caixas.md`, seção 8).

**Antes da F3**

1. Um serviço urgente que também tem tratamento ou montagem vai em que caixa? Hoje essa informação se perde? (Q2)
2. A OS tem formato fixo (só números? quantos dígitos?)? (Q4)
3. O que é "atrasado" na rotina: a maioria sai no dia seguinte? O urgente tem prazo menor? A resposta pode ajustar a D15. (Q5)

**Antes da F5**

4. "Cliente" é a ótica ou o paciente? Isso define as sugestões de cliente (R12). (Q3)
5. Quem dá baixa é quem lança? No balcão ou na bancada? Quantas pessoas usam o mesmo aparelho? Há Wi-Fi ou 4G estável perto da prateleira? (Q9, Q11)
6. Quantas caixas existem de cada cor, e quantos serviços entram por dia, em média e no pico? (Q6, Q10)
7. Fotos das caixas, para acertar as cores na tela.
