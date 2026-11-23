# Lens Flow: contrato da API

Versão 1.0 (F2, 2026-11-23). Este documento é a fonte da verdade da API e substitui o rascunho da seção 9 da [especificação](../produto/ESPECIFICACAO.md). Quem muda a API atualiza este arquivo no mesmo PR.

- As rotas da **F2** (sessão, usuários, caixas e metadados) estão **prontas**.
- As rotas da **F3** (folhas, serviços, baixas e histórico) estão marcadas como ***planejado***: o formato é uma proposta para o web trabalhar em paralelo e pode mudar na F3, que atualiza este documento.

## 1. Convenções

| Item | Regra |
|---|---|
| Prefixo | Todas as rotas ficam sob `/api` (T3). No desenvolvimento, o Vite faz o proxy de `/api` para `http://localhost:5000` |
| Formato | JSON (`Content-Type: application/json`) na ida e na volta. Corpo com no máximo 100 kB |
| Sessão | Cookie `lf_session` (veja a seção 2). O web usa `withCredentials: true` e nunca lê o cookie |
| Empresa | Vem sempre da sessão. Nenhuma rota aceita `business` no corpo, na consulta ou na URL |
| Identificadores | `id` é texto de 24 caracteres hexadecimais. Um `id` malformado responde 400; um `id` que não existe ou é de outra empresa responde 404 |
| Datas | Instantes em ISO 8601 UTC (`2026-11-23T11:42:05.120Z`). Datas de folha em `AAAA-MM-DD`, no fuso `America/Sao_Paulo`, calculadas no servidor |
| Validação | Todo corpo e toda consulta são validados. Campo a mais responde 400 com `"Campo não permitido."` |
| Consulta | Valores simples (`?state=free`). Repetir um parâmetro (`?state=a&state=b`) ou usar colchetes (`?a[b]=1`) responde 400 |
| Cache | Toda resposta de `/api` vem com `Cache-Control: no-store` (aparelho compartilhado, D12) |
| Mensagens | `message` e os textos de `fields` estão em pt-BR e podem ir direto para a tela |

### 1.1 Erros

Todo erro tem o mesmo formato:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Confira os campos destacados.",
    "fields": { "number": "Use só dígitos no número da caixa." }
  }
}
```

- `fields` (opcional): mensagem por campo, para mostrar junto do campo. Em campo de lista, a chave leva o índice (`numbers.2`).
- `details` (opcional): dados para a tela explicar o erro. Hoje só no `BOX_OCCUPIED`, com `details.box`.

| `code` | HTTP | Quando |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Entrada inválida, JSON malformado ou campo a mais |
| `INVALID_CREDENTIALS` | 401 | Login com usuário inexistente, senha errada ou usuário inativo. A mensagem é sempre "Usuário ou senha inválidos." |
| `UNAUTHENTICATED` | 401 | Sem sessão, sessão vencida (12 h) ou sessão encerrada (senha trocada, usuário desativado). O web leva ao login e mantém a rota |
| `FORBIDDEN` | 403 | Perfil sem permissão, ou requisição que altera dados vinda de origem fora de `CORS_ORIGINS` |
| `NOT_FOUND` | 404 | Recurso inexistente ou de outra empresa, e rota que não existe |
| `BOX_OCCUPIED` | 409 | A caixa está ocupada (F2: edição de caixa; F3: lançamento e troca de caixa) |
| `CONFLICT` | 409 | Duplicidade (número de caixa, usuário) ou regra de negócio (último admin, desativar a si mesmo) |
| `PAYLOAD_TOO_LARGE` | 413 | Corpo acima de 100 kB |
| `RATE_LIMITED` | 429 | Muitas tentativas de login ou de troca de senha. Vem com o cabeçalho `Retry-After` (segundos) |
| `INTERNAL` | 500 | Erro inesperado. A resposta nunca traz detalhe nem stack; o detalhe vai só para o log do servidor |

Dentro do resultado item a item de um lote, cada falha usa o mesmo `{ code, message }`, mais o código `DUPLICATE_IN_BATCH` (número repetido no próprio lote).

### 1.2 Constantes

| Constante | Valores |
|---|---|
| Perfil (`role`) | `admin`, `operator` |
| Cor da caixa (`color`) | `branca`, `preta`, `verde`, `amarela`, `vermelha`, `azul` (RN-03). O hex fica no web |
| Categoria (`category`) | `without_assembly` (Sem montagem: branca, preta), `with_assembly` (Com montagem: verde, amarela), `urgent` (Urgente: vermelha), `with_treatment` (Com tratamento: azul). Sempre derivada da cor (RN-04, D3) |
| Estado da caixa (`state`) | `free`, `occupied` |
| Situação do serviço (`status`) | `open` (pendente), `out` (saiu) |
| Número da caixa | Só dígitos, de 1 a 6, maior que zero. Zeros à esquerda são removidos: `"007"` vira `"7"`. Único na empresa, em qualquer cor (D4) |
| Usuário (`username`) | De 3 a 30 caracteres: `a-z`, `0-9`, `.`, `_` e `-`, começando por letra ou número. Guardado em minúsculas e único entre todas as empresas |
| Senha | De 8 a 64 caracteres (e até 72 bytes, limite do bcrypt) |
| Nome da pessoa | De 1 a 80 caracteres |
| Lote de caixas | No máximo 500 números; a lista em texto tem até 2.000 caracteres |

### 1.3 Tipos

**SessionUser**: o usuário logado.

```json
{
  "id": "6741a0c2f1d3a8b9c0e1f201",
  "name": "Ana Souza",
  "username": "ana",
  "role": "operator",
  "business": { "id": "6741a0c2f1d3a8b9c0e1f200", "name": "Laboratório Lente Boa" }
}
```

**User**: na gestão de usuários (admin).

```json
{
  "id": "6741a0c2f1d3a8b9c0e1f201",
  "name": "Ana Souza",
  "username": "ana",
  "role": "operator",
  "active": true,
  "locked": false,
  "lockedUntil": null,
  "lastLoginAt": "2026-11-23T11:02:10.000Z",
  "createdAt": "2026-11-22T18:00:00.000Z",
  "updatedAt": "2026-11-23T11:02:10.000Z"
}
```

`locked` é `true` enquanto o usuário estiver bloqueado por senhas erradas, e `lockedUntil` diz até quando. Senha, hash e contadores internos nunca aparecem em resposta.

**Box**: a caixa.

```json
{
  "id": "6741a0c2f1d3a8b9c0e1f310",
  "number": "12",
  "color": "vermelha",
  "colorLabel": "Vermelha",
  "category": "urgent",
  "categoryLabel": "Urgente",
  "state": "occupied",
  "active": true,
  "currentMovement": {
    "id": "6741a0c2f1d3a8b9c0e1f420",
    "clientName": "Ótica Central",
    "orderService": "4521",
    "status": "open",
    "sheetDate": "2026-11-22",
    "createdAt": "2026-11-22T11:12:00.000Z",
    "createdBy": { "id": "6741a0c2f1d3a8b9c0e1f201", "name": "Ana Souza" }
  },
  "createdAt": "2026-11-20T13:00:00.000Z",
  "updatedAt": "2026-11-22T11:12:00.000Z"
}
```

`currentMovement` é `null` na caixa livre. Na ocupada, é o resumo do serviço que está nela (R1): cliente, OS, autor e data. Com `status: "out"`, o serviço já saiu e a caixa espera ser liberada (D6).

## 2. Sessão e segurança

- **Cookie:** `lf_session`, `HttpOnly`, `SameSite=Lax`, `Path=/api`, validade de 12 h (RN-14) e `Secure` em produção. O conteúdo é um JWT assinado no servidor; o web não precisa lê-lo.
- **Sessão sempre conferida:** a cada requisição, o servidor relê o usuário. Desativar o usuário, redefinir a senha dele ou ele trocar a própria senha encerra as sessões antigas na hora (resposta 401 `UNAUTHENTICATED`). Mudança de perfil vale na próxima requisição.
- **Bloqueio por usuário:** 5 senhas erradas seguidas bloqueiam o usuário por 15 min (RN-14). Durante o bloqueio, toda tentativa recebe 429 `RATE_LIMITED`, mesmo com a senha certa. Um login certo zera a contagem. O admin desbloqueia na hora redefinindo a senha.
- **Limite por IP:** 20 logins errados em 15 min por IP. Logins certos não contam, porque o laboratório costuma sair por um IP só. A troca de senha aceita 10 tentativas com erro em 15 min, por usuário.
- **Origem:** o CORS libera só as origens de `CORS_ORIGINS`, com credenciais. Além disso, `POST`, `PATCH`, `PUT` e `DELETE` vindos de um navegador precisam trazer `Origin` dessa lista, senão a resposta é 403 (defesa contra CSRF, além do `SameSite`).
- **Cabeçalhos:** helmet ligado (CSP, `nosniff`, `X-Frame-Options` e outros) e sem `X-Powered-By`.

## 3. Rotas da F2 (prontas)

| Método e rota | Quem | Faz |
|---|---|---|
| `GET /health` · `GET /api/health` | público | Verificação de saúde |
| `POST /api/auth/login` | público | Entra e grava o cookie de sessão |
| `POST /api/auth/logout` | público | Apaga o cookie deste aparelho |
| `GET /api/auth/me` | logado | Usuário da sessão |
| `PATCH /api/auth/password` | logado | Troca a própria senha |
| `GET /api/meta/box-colors` | logado | Cores, rótulos e categorias |
| `GET /api/boxes` | logado | Caixas em ordem natural, com filtros |
| `GET /api/boxes/:id` | logado | Uma caixa (link direto, R19) |
| `POST /api/boxes` | admin | Cadastra uma caixa |
| `POST /api/boxes/batch` | admin | Cadastra várias caixas de uma cor |
| `PATCH /api/boxes/:id` | admin | Edita número, cor e ativo |
| `GET /api/users` | admin | Lista os usuários da empresa |
| `POST /api/users` | admin | Cria um usuário |
| `PATCH /api/users/:id` | admin | Edita nome, perfil e ativo |
| `POST /api/users/:id/reset-password` | admin | Redefine a senha |

Rota sob `/api` que não está na tabela responde 401 sem sessão e 404 com sessão. As rotas antigas (`/businesses`, `/boxes`, `/movements`, `/movement-sheets` fora de `/api`) não existem mais.

### 3.1 Saúde

`GET /api/health` (também em `GET /health`, para a infraestrutura) → **200** `{ "status": "ok" }`. Não precisa de sessão nem de banco.

### 3.2 `POST /api/auth/login`

Corpo:

```json
{ "username": "ana", "password": "minha-senha" }
```

O usuário não distingue maiúsculas nem espaços nas pontas.

**200**, com `Set-Cookie: lf_session=…`:

```json
{ "user": { "id": "…", "name": "Ana Souza", "username": "ana", "role": "operator", "business": { "id": "…", "name": "Laboratório Lente Boa" } } }
```

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Falta usuário ou senha (`fields.username`, `fields.password`) |
| 401 `INVALID_CREDENTIALS` | Usuário inexistente, senha errada ou usuário inativo, sempre com "Usuário ou senha inválidos." |
| 403 `FORBIDDEN` | `Origin` fora de `CORS_ORIGINS` |
| 429 `RATE_LIMITED` | Usuário bloqueado (5 erros) ou limite do IP. Mensagem "Muitas tentativas. Aguarde N min e tente de novo." e `Retry-After` |

A tela de login mostra a mensagem do 401 ou do 429 como vier.

### 3.3 `POST /api/auth/logout`

Sem corpo. **204**, apagando o cookie. Funciona mesmo com a sessão já vencida, então serve para o "Trocar usuário" (D12). *Diferença do rascunho:* a especificação listava o logout como "logado"; ele ficou público para nunca falhar.

### 3.4 `GET /api/auth/me`

**200** `{ "user": SessionUser }`. Sem sessão válida, **401** `UNAUTHENTICATED`, com uma destas mensagens:

| Mensagem | Quando |
|---|---|
| "Entre com seu usuário e senha para continuar." | Sem cookie |
| "Sua sessão expirou. Entre de novo." | Passou de 12 h |
| "Sua sessão não é válida. Entre de novo." | Cookie adulterado ou assinado com outro segredo |
| "Sua sessão não é mais válida. Entre de novo." | Senha trocada ou redefinida, ou usuário desativado |

Nos três últimos casos a resposta também apaga o cookie. As mesmas mensagens valem para qualquer rota logada.

### 3.5 `PATCH /api/auth/password`

Corpo:

```json
{ "currentPassword": "senha-atual", "newPassword": "senha-nova-123" }
```

**204**, com um cookie novo: esta sessão continua e as outras sessões do usuário são encerradas.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Senha atual incorreta (`fields.currentPassword`), nova senha fora das regras ou igual à atual (`fields.newPassword`) |
| 429 `RATE_LIMITED` | 10 tentativas com erro em 15 min, por usuário |

### 3.6 `GET /api/meta/box-colors`

**200**:

```json
{
  "colors": [
    { "key": "branca", "label": "Branca", "category": "without_assembly", "categoryLabel": "Sem montagem" },
    { "key": "preta", "label": "Preta", "category": "without_assembly", "categoryLabel": "Sem montagem" },
    { "key": "verde", "label": "Verde", "category": "with_assembly", "categoryLabel": "Com montagem" },
    { "key": "amarela", "label": "Amarela", "category": "with_assembly", "categoryLabel": "Com montagem" },
    { "key": "vermelha", "label": "Vermelha", "category": "urgent", "categoryLabel": "Urgente" },
    { "key": "azul", "label": "Azul", "category": "with_treatment", "categoryLabel": "Com tratamento" }
  ],
  "categories": [
    { "key": "without_assembly", "label": "Sem montagem", "colors": ["branca", "preta"] },
    { "key": "with_assembly", "label": "Com montagem", "colors": ["verde", "amarela"] },
    { "key": "urgent", "label": "Urgente", "colors": ["vermelha"] },
    { "key": "with_treatment", "label": "Com tratamento", "colors": ["azul"] }
  ]
}
```

A ordem é estável. O hex de cada cor é decisão do web (B14, R10).

### 3.7 `GET /api/boxes`

Consulta, com todos os parâmetros opcionais:

| Parâmetro | Valores | Exemplo |
|---|---|---|
| `number` | Número da caixa, normalizado (`0012` = `12`) | `?number=12` |
| `state` | `free`, `occupied` | `?state=free` |
| `color` | Uma cor | `?color=vermelha` |
| `category` | Uma categoria | `?category=urgent` |
| `active` | `true`, `false` | `?active=true` |

**200** `{ "boxes": Box[] }`, em ordem natural de número ("2" antes de "10") e com todas as cores juntas. Sem paginação: um laboratório tem centenas de caixas. Inclui as inativas, a menos que se filtre por `active`.

**Novo serviço (R1, D4):** `GET /api/boxes?number=12` devolve a caixa com aquele número, livre ou ocupada, ou `{ "boxes": [] }` se não existir. A ocupada traz `currentMovement` com cliente, OS, autor e data, para a tela mostrar "ocupada por Fulano desde dd/mm".

### 3.8 `GET /api/boxes/:id`

**200** `{ "box": Box }`. **400** com `id` malformado e **404** "Caixa não encontrada." se não existir ou for de outra empresa. Base do link direto por caixa (R19, rota `/caixas/:id` no web).

### 3.9 `POST /api/boxes` (admin)

Corpo:

```json
{ "number": "12", "color": "vermelha" }
```

**201** `{ "box": Box }`, com a categoria derivada da cor.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.number` ("Use só dígitos no número da caixa.", "O número da caixa precisa ser maior que zero.", "O número da caixa pode ter no máximo 6 dígitos.", "Envie o número da caixa como texto…"), `fields.color` (cor fora da lista) ou campo a mais (`category`, `state`, `business`…) |
| 403 `FORBIDDEN` | Operador |
| 409 `CONFLICT` | O número já existe na empresa, em qualquer cor (D4): "Já existe a caixa 12 (Azul). O número não se repete, nem em outra cor.", com `fields.number` |

### 3.10 `POST /api/boxes/batch` (admin)

Cadastro em lote (RN-13), por exemplo "vermelha: 3, 12, 27-30". Corpo:

```json
{ "color": "vermelha", "numbers": "3, 12, 27-30" }
```

`numbers` é um texto com números e intervalos separados por vírgula, ponto e vírgula, espaço ou quebra de linha. Os intervalos usam hífen ou travessão e incluem as pontas. Também aceita um vetor de textos (`["3", "12", "27-30"]`).

**200**, com um resultado por número pedido, na ordem digitada:

```json
{
  "results": [
    { "number": "3", "ok": true, "box": { "id": "…", "number": "3", "color": "vermelha", "category": "urgent", "…": "…" } },
    { "number": "12", "ok": false, "error": { "code": "CONFLICT", "message": "Já existe a caixa 12 (Azul)." } },
    { "number": "27", "ok": true, "box": { "…": "…" } },
    { "number": "27", "ok": false, "error": { "code": "DUPLICATE_IN_BATCH", "message": "Número repetido neste lote." } }
  ],
  "summary": { "requested": 4, "created": 2, "failed": 2 }
}
```

- `requested` conta os números depois de expandir os intervalos, com as repetições.
- O número que já existe (em qualquer cor) ou que se repete no lote volta com `ok: false`; os demais são criados juntos.
- Entrada malformada recusa o lote inteiro com 400 e `fields.numbers`: item que não é número nem intervalo ("abc"), intervalo invertido ("30-27"), zero, mais de 6 dígitos, lista vazia ou mais de 500 números.

### 3.11 `PATCH /api/boxes/:id` (admin)

Corpo com pelo menos um destes campos:

```json
{ "number": "13", "color": "azul", "active": false }
```

**200** `{ "box": Box }`. Trocar a cor troca a categoria. `active: false` desativa a caixa (perdida ou quebrada), que deixa de receber serviço (RN-05). Enviar os mesmos valores não muda nada e não gera histórico.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Corpo vazio ("Informe pelo menos um campo para alterar."), valor inválido ou campo a mais (`state`, `category`…) |
| 403 `FORBIDDEN` | Operador |
| 404 `NOT_FOUND` | Caixa inexistente ou de outra empresa |
| 409 `BOX_OCCUPIED` | A caixa está ocupada: nenhuma edição é aceita, nem desativar. `details.box` traz a caixa com o serviço atual |
| 409 `CONFLICT` | O número novo já existe (`fields.number`) |

### 3.12 `GET /api/users` (admin)

**200** `{ "users": User[] }`: os ativos e os inativos da empresa, em ordem de nome (sem distinguir acento nem maiúscula).

### 3.13 `POST /api/users` (admin)

Corpo:

```json
{ "name": "Ana Souza", "username": "ana", "password": "senha-temporaria", "role": "operator" }
```

**201** `{ "user": User }`. O admin passa a senha inicial para a pessoa, que pode trocá-la em "Minha conta".

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.name`, `fields.username`, `fields.password` ou `fields.role` |
| 409 `CONFLICT` | O usuário já existe, sem distinguir maiúsculas, em qualquer empresa (`fields.username`) |

### 3.14 `PATCH /api/users/:id` (admin)

Corpo com pelo menos um destes campos:

```json
{ "name": "Ana Souza Lima", "role": "admin", "active": false }
```

**200** `{ "user": User }`. Não existe exclusão: desativar encerra as sessões da pessoa, e reativar exige um login novo.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Corpo vazio, valor inválido ou campo a mais (`username` e `password` não se editam aqui) |
| 404 `NOT_FOUND` | Usuário inexistente ou de outra empresa |
| 409 `CONFLICT` | "Você não pode desativar o seu próprio usuário." ou "A empresa precisa de pelo menos um administrador ativo. Promova outra pessoa antes." (desativar ou rebaixar o último admin ativo, RN-13) |

Um admin pode rebaixar a si mesmo se houver outro admin ativo.

### 3.15 `POST /api/users/:id/reset-password` (admin)

Corpo `{ "password": "nova-senha-temporaria" }`. **204**. Encerra todas as sessões da pessoa e tira o bloqueio por senhas erradas. Se o admin redefinir a própria senha, a sessão dele continua com um cookie novo. Erros: 400 (`fields.password`) e 404.

## 4. Histórico (auditoria)

Toda mutação grava um evento imutável (RN-02) na mesma transação da mudança: os dois entram juntos, ou nenhum. Senha e hash nunca entram no histórico.

| `action` | Quando | `before` / `after` |
|---|---|---|
| `business.create` | `seed:admin` criou a empresa (`user: null`) | `null` / `{ name }` |
| `user.create` | Usuário criado (pelo admin ou pelo `seed:admin`) | `null` / `{ name, username, role, active }` |
| `user.update` | Nome, perfil ou ativo mudou | Só os campos que mudaram |
| `user.reset_password` | Admin redefiniu a senha | `null` / `null` |
| `user.change_password` | A pessoa trocou a própria senha | `null` / `null` |
| `user.lock` | Bloqueio automático após 5 erros (`user: null`) | `null` / `{ lockedUntil }` |
| `box.create` | Caixa cadastrada (também cada uma do lote) | `null` / `{ number, color, category, state, active }` |
| `box.update` | Número, cor ou ativo mudou | Só os campos que mudaram, mais `category` quando a cor muda |

Cada evento tem `business`, `user` (quem fez, ou `null` quando é o sistema), `action`, `entity` (`Business`, `User`, `Box`, `MovementSheet` ou `Movement`), `entityId`, `before`, `after` e `at`. A consulta (`GET /api/audit`) chega na F3.

## 5. Rotas da F3 (*planejado*)

Tudo nesta seção é proposta. A F3 confirma ou ajusta e tira a marca de *planejado*. Os números entre parênteses apontam para a [pesquisa da F0](../pesquisa/2026-11-22-rastreamento-de-caixas.md), seção 7.

| Método e rota | Quem | Faz |
|---|---|---|
| `GET /api/sheets?from=&to=` | logado | Dias com contadores |
| `GET /api/sheets/:date` | logado | Os serviços de um dia |
| `POST /api/movements` | logado | Lança um serviço na folha de hoje |
| `GET /api/movements` | logado | Pendentes, baixas e busca, com cursor |
| `GET /api/movements/:id` | logado | Detalhe com a linha do tempo |
| `PATCH /api/movements/:id` | autor no dia / admin | Edita cliente, OS e observação |
| `DELETE /api/movements/:id` | autor no dia / admin | Exclusão lógica, que libera a caixa |
| `POST /api/movements/:id/change-box` | autor no dia / admin | Troca a caixa de forma atômica (RN-12) |
| `POST /api/movements/:id/checkout` | logado | Baixa ("saiu") |
| `POST /api/movements/:id/release-box` | logado | Libera a caixa (exige a baixa antes, D6) |
| `POST /api/movements/batch` | logado | Baixa, liberação ou as duas, em lote |
| `POST /api/movements/:id/undo` | autor até 10 min / admin | Desfaz a baixa ou a liberação |
| `POST /api/movements/batch/:batchId/undo` | autor até 10 min / admin | Desfaz um lote inteiro (D9) |
| `GET /api/audit` | admin | Histórico geral |

### 5.1 Tipo Movement (*planejado*)

```json
{
  "id": "6741a0c2f1d3a8b9c0e1f420",
  "sheetDate": "2026-11-22",
  "box": { "id": "…", "number": "12", "color": "vermelha", "colorLabel": "Vermelha", "category": "urgent", "categoryLabel": "Urgente" },
  "boxSnapshot": { "number": "12", "color": "vermelha", "category": "urgent" },
  "clientName": "Ótica Central",
  "orderService": "4521",
  "note": null,
  "status": "open",
  "daysOpen": 1,
  "delayLevel": "attention",
  "createdBy": { "id": "…", "name": "Ana Souza" },
  "createdAt": "2026-11-22T11:12:00.000Z",
  "outBy": null,
  "outAt": null,
  "boxReleasedBy": null,
  "boxReleasedAt": null,
  "undo": null
}
```

- `box` é a caixa onde o serviço está agora; `boxSnapshot` guarda a caixa como estava no lançamento.
- `daysOpen` e `delayLevel` vêm só nos serviços abertos e são calculados no servidor, com a data de hoje no fuso `America/Sao_Paulo` (R4, RN-10). `daysOpen` conta os dias de calendário desde a folha: lançado hoje é 0.
- `delayLevel` segue a D15:

  | Dias em aberto | Caixa comum | Caixa vermelha (sobe um nível antes) |
  |---|---|---|
  | 0 (hoje) | `neutral` | `normal` |
  | 1 (ontem) | `normal` | `attention` |
  | 2 | `attention` | `late` |
  | 3 ou mais | `late` | `late` |

  A linha "0 (hoje)" da vermelha é a leitura de "sobe um nível" e fica para a F3 confirmar. O web mostra o nível sempre com texto e ícone, nunca só pela cor.
- `undo` (proposta para a contagem regressiva da R7): `{ "action": "checkout" | "release-box", "until": "…" }` quando quem está logado ainda pode desfazer a última ação, ou `null`.

As listas trazem também `serverDate` (a data de hoje no servidor), para a tela não depender do relógio do aparelho (R4).

### 5.2 `POST /api/movements` (*planejado*)

Corpo:

```json
{ "boxId": "…", "clientName": "Ótica Central", "orderService": "4521", "note": "aguardando armação", "clientRequestId": "0b7c3c1e-6f0e-4b8e-9a59-2f1d0c9e8a11" }
```

- Caixa e cliente obrigatórios; OS e observação opcionais (D14, RN-07). O serviço entra na folha de hoje, criada sozinha no primeiro lançamento (RN-06).
- Ocupa a caixa numa transação. **409 `BOX_OCCUPIED`** se a caixa estiver ocupada, com `details.box` (cliente, autor e data do serviço que está nela). Caixa inativa: 409 `CONFLICT`. Dois lançamentos simultâneos na mesma caixa: só um entra (RN-05).
- **Idempotência (R13):** `clientRequestId` (UUID gerado pelo web a cada tentativa) é opcional. Repetir a mesma chave devolve o resultado original, sem lançar de novo e sem falso `BOX_OCCUPIED`. Índice único parcial por empresa.
- **OS repetida (D16, RN-15):** se a OS já estiver num serviço aberto, o lançamento entra mesmo assim e a resposta traz o aviso:

```json
{
  "movement": { "…": "…" },
  "warnings": [
    {
      "code": "DUPLICATE_ORDER_SERVICE",
      "message": "A OS 4521 já está na caixa 12 (Vermelha), aberta desde 22/11.",
      "movements": [{ "id": "…", "box": { "number": "12", "color": "vermelha" }, "sheetDate": "2026-11-22", "clientName": "Ótica Central" }]
    }
  ]
}
```

Para avisar enquanto a pessoa digita (R11), o web consulta antes `GET /api/movements?status=open&orderService=4521`.

### 5.3 `GET /api/movements` (*planejado*)

| Parâmetro | Valores |
|---|---|
| `status` | `open` (Conferência), `out` (Baixas) |
| `boxReleased` | `false` com `status=out`: "saiu, caixa não liberada" (R15) |
| `sort` | `priority` (padrão: urgente, depois o mais antigo, depois o número em ordem natural, RN-10), `box` (só o número, seguindo a prateleira), `recent` (mais recente primeiro, tela Hoje) e, para "Mais antigos" da F5, `oldest` |
| `q` | Busca num campo só (R9): cliente por prefixo ou trecho sem acento; com só dígitos, OS exata ou prefixo e número de caixa. A busca cobre todos os dias |
| `orderService` | OS exata (aviso de OS repetida) |
| `color`, `category` | Filtros da Conferência |
| `from`, `to` | Período (AAAA-MM-DD), por exemplo nas Baixas |
| `createdBy`, `outBy` | Filtro por usuário |
| `cursor`, `limit` | Paginação por cursor; `limit` padrão 50, máximo 100 |

**200**:

```json
{ "items": [], "nextCursor": null, "serverDate": "2026-11-23", "counts": { "open": 42, "late": 3 } }
```

Cada item de busca já responde onde o serviço está (R9): caixa atual, situação ("aberto há N dias" ou "saiu"), quem lançou e quando. `counts.late` alimenta o contador de atrasados da barra de navegação e da tela Hoje (R8).

### 5.4 Detalhe, correções e troca de caixa (*planejado*)

- `GET /api/movements/:id` → `{ movement, history }`. `history` é a linha do tempo: `[{ action, at, user: { id, name }, before, after }]` ("Lançado por Ana 08:12 · Baixa por João 23/11 09:03 · Caixa liberada por João 09:04").
- `PATCH /api/movements/:id` com `{ clientName?, orderService?, note? }`. O operador edita só o próprio lançamento, no mesmo dia; o admin edita qualquer um (RN-11). Fora da regra: 403.
- `DELETE /api/movements/:id`: exclusão lógica, que libera a caixa. O serviço some das listas e continua no histórico. Mesmas permissões do `PATCH`.
- `POST /api/movements/:id/change-box` com `{ boxId }`: libera a antiga e ocupa a nova numa operação (RN-12). 409 `BOX_OCCUPIED` se a nova estiver ocupada.

### 5.5 Baixa, liberação e lote (*planejado*)

- `POST /api/movements/:id/checkout`: marca como saído e grava quem e quando (RN-08), em qualquer dia, inclusive no mesmo dia.
- `POST /api/movements/:id/release-box`: libera a caixa. Exige a baixa antes (D6), senão 409 `CONFLICT` "Dê baixa antes de liberar a caixa.".
- `POST /api/movements/batch`, com `action` igual a `checkout`, `release-box` ou `checkout-and-release`:

```json
{ "ids": ["…", "…"], "action": "checkout-and-release", "clientRequestId": "…" }
```

  Aceita de 1 a 100 `ids`, e o mesmo `clientRequestId` da R13. **200**, com falha parcial permitida:

```json
{
  "batchId": "6741b0…",
  "results": [
    { "id": "…", "ok": true, "movement": { "…": "…" } },
    { "id": "…", "ok": false, "error": { "code": "CONFLICT", "message": "Esse serviço já saiu." } }
  ],
  "summary": { "requested": 2, "succeeded": 1, "failed": 1 }
}
```

  "Saiu e liberar" de um serviço só usa este endpoint com um `id`.

### 5.6 Desfazer (*planejado*)

- `POST /api/movements/:id/undo` com `{ "action": "checkout" | "release-box" }`: o autor desfaz em até 10 min; o admin, a qualquer tempo (RN-11). Se a caixa já recebeu outro serviço, responde 409 `CONFLICT`.
- `POST /api/movements/batch/:batchId/undo`: desfaz o lote inteiro, item a item, com as mesmas regras e o mesmo formato de resultado (R7, D9).

### 5.7 Folhas e histórico geral (*planejado*)

- `GET /api/sheets?from=&to=` → `{ "sheets": [{ "date": "2026-11-22", "counts": { "launched": 58, "out": 51, "open": 7 } }], "serverDate": "2026-11-23" }`, com os contadores por agregação.
- `GET /api/sheets/:date` → `{ "sheet": { "date": "…", "counts": { "…": "…" } }, "items": Movement[] }`.
- `GET /api/audit?user=&from=&to=&entity=&cursor=` (admin) → `{ "items": [{ "id", "action", "entity", "entityId", "user": { "id", "name" }, "before", "after", "at" }], "nextCursor": null }`.

### 5.8 Dados de demonstração (*planejado*, R18)

`npm run seed:demo` gera cerca de 1 ano de serviços, com os perfis base (60 por dia), alto (150) e estresse (600). Cria também uma Conferência com 300 pendentes e um lote de 100 itens, e registra o p95 de cada lista (meta abaixo de 300 ms, seção 7 da especificação).

## 6. Rodar a API localmente

- O MongoDB precisa estar em **replica set**, porque cadastros e alterações usam transação (T6). Sem replica set, a API sobe fora de produção com um aviso: o login, o logout e as consultas funcionam, mas cadastros e alterações (usuários, caixas, troca de senha) falham com 500. Em produção, ela não sobe. Para um `mongod` local: suba com `--replSet rs0` e rode uma vez `rs.initiate()` no `mongosh`.
- Primeiro admin: `SEED_ADMIN_PASSWORD='…' npm run seed:admin` (no PowerShell, `$env:SEED_ADMIN_PASSWORD='…'; npm run seed:admin`). Opcionais: `SEED_ADMIN_USERNAME` (padrão `admin`), `SEED_ADMIN_NAME` e `SEED_BUSINESS_NAME`. Recusa se já houver admin ativo. Não precisa de replica set.
- Banco de desenvolvimento (D13): os dados antigos são de teste e não servem no esquema novo (cor em hex, empresa com senha, folha com lista de serviços). Zere antes de subir a API nova: `mongosh "mongodb://127.0.0.1:27017/lens-flow-dev" --eval "db.dropDatabase()"`. Depois rode o `seed:admin`.
