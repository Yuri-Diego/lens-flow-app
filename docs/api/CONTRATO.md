# Lens Flow: contrato da API

Versão 1.4 (onda 5, 2026-11-24). Este documento é a fonte da verdade da API e substitui o rascunho da seção 9 da [especificação](../produto/ESPECIFICACAO.md). Quem muda a API atualiza este arquivo no mesmo PR.

- As rotas da **F2** (sessão, usuários, caixas e metadados) estão **prontas**.
- As rotas da **F3** (folhas, serviços, baixas, lotes e histórico) estão **prontas**. O que mudou em relação à versão *planejada* da 1.0 está na seção 5.12.
- Desde a F3, o número da caixa é guardado exatamente como na etiqueta, com o zero à esquerda (D18).
- Desde a onda 3 (D19), qualquer pessoa logada troca a caixa de um serviço aberto, em qualquer dia e de qualquer autor. O serviço traz `canChangeBox`, que diz ao web quando mostrar "Trocar caixa". O que mudou está na seção 5.13.
- Desde a onda 4, qualquer pessoa logada tem duas rotas novas: as sugestões de cliente enquanto digita (`GET /api/clients/suggestions`, D24, seção 5.14) e os usuários como opções de filtro (`GET /api/users/options`, seção 3.16). O que mudou está na seção 5.15.
- Desde a onda 5 (D26), maiúsculas e minúsculas não diferenciam a OS na busca, no filtro `orderService` e no aviso de OS repetida. A OS continua sendo devolvida como foi digitada. O que mudou está na seção 5.16.

## 1. Convenções

| Item | Regra |
|---|---|
| Prefixo | Todas as rotas ficam sob `/api` (T3). No desenvolvimento, o Vite faz o proxy de `/api` para `http://localhost:5000` |
| Formato | JSON (`Content-Type: application/json`) na ida e na volta. Corpo com no máximo 100 kB |
| Sessão | Cookie `lf_session` (veja a seção 2). O web usa `withCredentials: true` e nunca lê o cookie |
| Empresa | Vem sempre da sessão. Nenhuma rota aceita `business` no corpo, na consulta ou na URL |
| Identificadores | `id` é texto de 24 caracteres hexadecimais (maiúsculas e minúsculas valem o mesmo). Um `id` malformado responde 400; um `id` que não existe ou é de outra empresa responde 404 |
| Datas | Instantes em ISO 8601 UTC (`2026-11-23T11:42:05.120Z`). Datas de folha em `AAAA-MM-DD`, no fuso `America/Sao_Paulo`, calculadas no servidor com `Intl` (T8) |
| Data de hoje | As listas e o detalhe trazem `serverDate`, a data de hoje no servidor. A tela não depende do relógio do aparelho (R4) |
| Validação | Todo corpo e toda consulta são validados. Campo a mais responde 400 com `"Campo não permitido."` |
| Consulta | Valores simples (`?state=free`). Repetir um parâmetro (`?state=a&state=b`) ou usar colchetes (`?a[b]=1`) responde 400 |
| Paginação | Listas que crescem usam cursor: `limit` (de 1 a 100; padrão 50, e 31 nas folhas) e `cursor`, copiado do `nextCursor` da página anterior. `nextCursor: null` é a última página. O cursor é opaco e vale só para a mesma ordenação: de outra, responde 400 `"Cursor inválido. Recarregue a lista."` |
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

- `fields` (opcional): mensagem por campo, para mostrar junto do campo. Em campo de lista, a chave leva o índice (`numbers.2`, `ids.0`).
- `details` (opcional): dados para a tela explicar o erro. Só no `BOX_OCCUPIED`, com `details.box` (a caixa com o serviço que está nela).

| `code` | HTTP | Quando |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Entrada inválida, JSON malformado, campo a mais ou cursor inválido |
| `INVALID_CREDENTIALS` | 401 | Login com usuário inexistente, senha errada ou usuário inativo. A mensagem é sempre "Usuário ou senha inválidos." |
| `UNAUTHENTICATED` | 401 | Sem sessão, sessão vencida (12 h) ou sessão encerrada (senha trocada, usuário desativado). O web leva ao login e mantém a rota |
| `FORBIDDEN` | 403 | Perfil sem permissão (rotas de admin; editar ou excluir serviço fora da RN-11; desfazer fora da janela de 10 min), ou requisição que altera dados vinda de origem fora de `CORS_ORIGINS` |
| `NOT_FOUND` | 404 | Recurso inexistente, excluído ou de outra empresa, e rota que não existe |
| `BOX_OCCUPIED` | 409 | A caixa está ocupada: edição de caixa (F2), lançamento e troca de caixa (F3) |
| `CONFLICT` | 409 | Duplicidade (número de caixa, usuário), regra de negócio (último admin, desativar a si mesmo, caixa inativa) ou estado do serviço que não permite a ação (já saiu, liberar antes da baixa, caixa reutilizada) |
| `PAYLOAD_TOO_LARGE` | 413 | Corpo acima de 100 kB |
| `RATE_LIMITED` | 429 | Muitas tentativas de login ou de troca de senha. Vem com o cabeçalho `Retry-After` (segundos) |
| `INTERNAL` | 500 | Erro inesperado. A resposta nunca traz detalhe nem stack; o detalhe vai só para o log do servidor |

Dentro do resultado item a item de um lote, cada falha usa o mesmo `{ code, message }`, mais o código `DUPLICATE_IN_BATCH` (o mesmo número de caixa, ou o mesmo serviço, repetido no próprio lote).

### 1.2 Constantes

| Constante | Valores |
|---|---|
| Perfil (`role`) | `admin`, `operator` |
| Cor da caixa (`color`) | `branca`, `preta`, `verde`, `amarela`, `vermelha`, `azul` (RN-03). O hex fica no web |
| Categoria (`category`) | `without_assembly` (Sem montagem: branca, preta), `with_assembly` (Com montagem: verde, amarela), `urgent` (Urgente: vermelha), `with_treatment` (Com tratamento: azul). Sempre derivada da cor (RN-04, D3) |
| Estado da caixa (`state`) | `free`, `occupied` |
| Número da caixa | Só dígitos, de 1 a 6, maior que zero. **Guardado exatamente como na etiqueta (D18): o zero à esquerda é preservado, e `"007"` e `"7"` são caixas diferentes.** Só os espaços nas pontas saem. Único na empresa, em qualquer cor (D4), com comparação exata |
| Ordem natural do número | Pelo valor (`"2"` antes de `"10"`) e, no empate de valor, primeiro o de menos dígitos: `"7"`, `"07"`, `"007"`, `"8"` |
| Situação do serviço (`status`) | `open` (pendente), `out` (saiu) |
| Nível de atraso (`delayLevel`) | `neutral`, `normal`, `attention`, `late` (D15, seção 5.1) |
| Ordenação dos serviços (`sort`) | `priority`, `box`, `recent`, `oldest` (seção 5.3) |
| Ação do lote (`action`) | `checkout`, `release-box`, `checkout-and-release` |
| Ação do desfazer (`action`) | `checkout`, `release-box` |
| Usuário (`username`) | De 3 a 30 caracteres: `a-z`, `0-9`, `.`, `_` e `-`, começando por letra ou número. Guardado em minúsculas e único entre todas as empresas |
| Senha | De 8 a 64 caracteres (e até 72 bytes, limite do bcrypt) |
| Nome da pessoa | De 1 a 80 caracteres |
| Cliente do serviço | De 1 a 120 caracteres (espaços nas pontas saem) |
| OS e observação | Opcionais: OS com até 40 caracteres, observação com até 500. Os espaços nas pontas saem, e vazio vira `null` |
| Comparação da OS (D26) | Sem distinguir maiúsculas de minúsculas, em qualquer letra: `a-77` e `A-77` são a mesma OS, e `é-1` e `É-1` também. Todo o resto conta: acentos (`É-1` e `E-1` são diferentes), espaços do meio, pontuação e zeros à esquerda. **A OS é guardada e devolvida como foi digitada** |
| `clientRequestId` | De 8 a 64 caracteres: letras, números, `-` e `_` (um UUID serve) |
| Lote de caixas | No máximo 500 números; a lista em texto tem até 2.000 caracteres |
| Lote de serviços | De 1 a 100 ids |
| Busca (`q`) | Até 80 caracteres |
| Sugestões de cliente (`q`) | Obrigatório: de 1 a 80 caracteres, sem contar os espaços das pontas |
| Sugestões de cliente (`limit`) | De 1 a 20; padrão 8 |

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

**Movement**: o serviço. Veja a seção 5.1.

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
| `GET /api/users/options` | logado | Id, nome e ativo de cada usuário, para os filtros (onda 4) |
| `GET /api/users` | admin | Lista os usuários da empresa |
| `POST /api/users` | admin | Cria um usuário |
| `PATCH /api/users/:id` | admin | Edita nome, perfil e ativo |
| `POST /api/users/:id/reset-password` | admin | Redefine a senha |

Rota sob `/api` que não está nas tabelas das seções 3 e 5 responde 401 sem sessão e 404 com sessão. As rotas antigas (`/businesses`, `/boxes`, `/movements` e `/movement-sheets` fora de `/api`, e `PUT /api/movements/status/:id`) não existem mais.

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
| `number` | Número da caixa, exato (D18): `0012` e `12` são caixas diferentes | `?number=12` |
| `state` | `free`, `occupied` | `?state=free` |
| `color` | Uma cor | `?color=vermelha` |
| `category` | Uma categoria | `?category=urgent` |
| `active` | `true`, `false` | `?active=true` |

**200** `{ "boxes": Box[] }`, em ordem natural de número (seção 1.2: "2" antes de "10", "7" antes de "007") e com todas as cores juntas. Sem paginação: um laboratório tem centenas de caixas. Inclui as inativas, a menos que se filtre por `active`.

**Novo serviço (R1, D4):** `GET /api/boxes?number=12` devolve a caixa com exatamente aquele número, livre ou ocupada, ou `{ "boxes": [] }` se não existir. A ocupada traz `currentMovement` com cliente, OS, autor e data, para a tela mostrar "ocupada por Fulano desde dd/mm".

### 3.8 `GET /api/boxes/:id`

**200** `{ "box": Box }`. **400** com `id` malformado e **404** "Caixa não encontrada." se não existir ou for de outra empresa. Base do link direto por caixa (R19, rota `/caixas/:id` no web).

### 3.9 `POST /api/boxes` (admin)

Corpo:

```json
{ "number": "12", "color": "vermelha" }
```

**201** `{ "box": Box }`, com a categoria derivada da cor e o número como foi digitado (`"007"` fica `"007"`).

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.number` ("Use só dígitos no número da caixa.", "O número da caixa precisa ser maior que zero." para `0`, `00`…, "O número da caixa pode ter no máximo 6 dígitos." contando os zeros à esquerda, "Envie o número da caixa como texto…"), `fields.color` (cor fora da lista) ou campo a mais (`category`, `state`, `business`…) |
| 403 `FORBIDDEN` | Operador |
| 409 `CONFLICT` | O número já existe na empresa, em qualquer cor (D4): "Já existe a caixa 12 (Azul). O número não se repete, nem em outra cor.", com `fields.number`. `"007"` não conflita com `"7"` (D18) |

### 3.10 `POST /api/boxes/batch` (admin)

Cadastro em lote (RN-13), por exemplo "vermelha: 3, 12, 27-30". Corpo:

```json
{ "color": "vermelha", "numbers": "3, 12, 27-30" }
```

`numbers` é um texto com números e intervalos separados por vírgula, ponto e vírgula, espaço ou quebra de linha. Os intervalos usam hífen ou travessão e incluem as pontas. Também aceita um vetor de textos (`["3", "12", "27-30"]`).

**Zero à esquerda (D18):** um número sozinho é guardado como foi digitado. Um intervalo com zero à esquerda mantém a largura das pontas: `"007-010"` cria 007, 008, 009 e 010. Por isso, num intervalo com zero à esquerda, as duas pontas precisam ter a mesma quantidade de dígitos (`"7-010"` é recusado).

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
- O número que já existe (em qualquer cor) ou que se repete no lote volta com `ok: false`; os demais são criados juntos. `"07"` e `"7"` não são repetição.
- Entrada malformada recusa o lote inteiro com 400 e `fields.numbers`: item que não é número nem intervalo ("abc"), intervalo invertido ("30-27"), intervalo com zero à esquerda e larguras diferentes ("7-010"), zero, mais de 6 dígitos, lista vazia ou mais de 500 números.

### 3.11 `PATCH /api/boxes/:id` (admin)

Corpo com pelo menos um destes campos:

```json
{ "number": "13", "color": "azul", "active": false }
```

**200** `{ "box": Box }`. Trocar a cor troca a categoria. `active: false` desativa a caixa (perdida ou quebrada), que deixa de receber serviço (RN-05). Enviar os mesmos valores não muda nada e não gera histórico; renumerar `"8"` para `"008"` é uma mudança (D18).

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Corpo vazio ("Informe pelo menos um campo para alterar."), valor inválido ou campo a mais (`state`, `category`…) |
| 403 `FORBIDDEN` | Operador |
| 404 `NOT_FOUND` | Caixa inexistente ou de outra empresa |
| 409 `BOX_OCCUPIED` | A caixa está ocupada: nenhuma edição é aceita, nem desativar. `details.box` traz a caixa com o serviço atual |
| 409 `CONFLICT` | O número novo já existe (`fields.number`) |

Um lançamento e uma edição da mesma caixa ao mesmo tempo não se atropelam: se o lançamento vem antes, a edição recebe 409 `BOX_OCCUPIED`; se a edição vem antes, o lançamento já usa o número novo, ou recebe 409 se a caixa foi desativada.

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

### 3.16 `GET /api/users/options` (onda 4)

Os usuários da empresa como opções de filtro, por exemplo "Quem deu baixa" nas Baixas (`outBy`) ou "Lançado por" (`createdBy`). Qualquer pessoa logada usa, operador ou admin. Sem parâmetros. **200**:

```json
{
  "items": [
    { "id": "6741a0c2f1d3a8b9c0e1f201", "name": "Ana Souza", "active": true },
    { "id": "6741a0c2f1d3a8b9c0e1f202", "name": "João Lima", "active": false }
  ]
}
```

- Todos os usuários da empresa da sessão, ativos e inativos, em ordem de nome (sem distinguir acento nem maiúscula, como em `GET /api/users`). O inativo vem com `active: false`, porque aparece em baixas e lançamentos antigos.
- Só `id`, `name` e `active`: sem o usuário de login (`username`), o perfil, a senha, o hash e o bloqueio.
- O resto de `/api/users` continua só do admin. O operador recebe 403 em `GET /api/users`, `POST /api/users`, `PATCH /api/users/:id` e `POST /api/users/:id/reset-password`, e também em qualquer outro método ou caminho sob `/api/users/options`.
- Erros: 400 com qualquer parâmetro ("Campo não permitido."), 401 sem sessão.

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
| `sheet.create` | A folha do dia nasceu no primeiro lançamento (entidade `MovementSheet`) | `null` / `{ date }` |
| `movement.create` | Serviço lançado | `null` / `{ sheetDate, box, clientName, orderService, note }` |
| `movement.update` | Cliente, OS ou observação mudou | Só os campos que mudaram |
| `movement.change_box` | Caixa trocada (RN-12). `user` é quem trocou, que pode não ser o autor do lançamento (D19) | `{ box }` (a antiga) / `{ box }` (a nova) |
| `movement.checkout` | Baixa | `{ status: "open" }` / `{ status: "out", outAt }` |
| `movement.release_box` | Caixa liberada | `{ boxReleasedAt: null }` / `{ boxReleasedAt, box }` |
| `movement.undo_checkout` | Baixa desfeita | `{ status: "out", outBy, outAt }` / `{ status: "open" }` |
| `movement.undo_release_box` | Liberação desfeita (a caixa volta a ficar com o serviço) | `{ boxReleasedBy, boxReleasedAt }` / `{ boxReleasedAt: null, box }` |
| `movement.delete` | Exclusão lógica | `{ status, boxReleasedAt }` / `{ deletedAt, boxFreed }` |

- `box` nos eventos de serviço é `{ id, number, color, category }`: a caixa como estava naquele momento. O `movement.create` guarda a caixa do lançamento, mesmo que ela seja trocada depois.
- Nas ações feitas por um lote, `after.batchId` traz o id do lote (seção 5.8).
- Cada evento tem `business`, `user` (quem fez, ou `null` quando é o sistema), `action`, `entity` (`Business`, `User`, `Box`, `MovementSheet` ou `Movement`), `entityId`, `before`, `after` e `at`.
- O resumo dos nomes de cliente das sugestões (seção 5.14) é derivado dos serviços e não gera evento próprio: o que fica no histórico é o lançamento, a edição ou a exclusão do serviço.
- A consulta é `GET /api/audit` (seção 5.11) e, para um serviço, o `history` do detalhe (seção 5.5).

## 5. Rotas da F3 (prontas)

| Método e rota | Quem | Faz |
|---|---|---|
| `GET /api/sheets` | logado | Dias com contadores, do mais recente |
| `GET /api/sheets/:date` | logado | Contadores e serviços de um dia |
| `GET /api/movements` | logado | Conferência, Baixas, busca e listas, com cursor |
| `GET /api/movements/summary` | logado | Contadores da barra de navegação e da tela Hoje |
| `POST /api/movements` | logado | Lança um serviço na folha de hoje |
| `GET /api/movements/:id` | logado | Detalhe com a linha do tempo |
| `PATCH /api/movements/:id` | autor no dia / admin | Edita cliente, OS e observação |
| `DELETE /api/movements/:id` | autor no dia / admin | Exclusão lógica, que libera a caixa |
| `POST /api/movements/:id/change-box` | logado (D19) | Troca a caixa de um serviço aberto de forma atômica (RN-12) |
| `POST /api/movements/:id/checkout` | logado | Baixa ("saiu") |
| `POST /api/movements/:id/release-box` | logado | Libera a caixa (exige a baixa antes, D6) |
| `POST /api/movements/batch` | logado | Baixa, liberação ou as duas, em lote |
| `POST /api/movements/:id/undo` | autor até 10 min / admin | Desfaz a baixa ou a liberação |
| `POST /api/movements/batch/:batchId/undo` | autor até 10 min / admin | Desfaz um lote inteiro (D9) |
| `GET /api/clients/suggestions` | logado | Nomes de cliente já usados, enquanto a pessoa digita (D24, onda 4) |
| `GET /api/audit` | admin | Histórico geral |

Todas as operações que mexem em serviço e caixa (lançar, trocar caixa, baixa, liberar, excluir, desfazer) rodam numa transação, junto com o histórico (T6, RN-02). As rotas sem corpo aceitam corpo vazio ou `{}`; qualquer campo responde 400.

### 5.1 Tipo Movement

```json
{
  "id": "6741a0c2f1d3a8b9c0e1f420",
  "sheetDate": "2026-11-22",
  "box": { "id": "6741a0c2f1d3a8b9c0e1f310", "number": "12", "color": "vermelha", "colorLabel": "Vermelha", "category": "urgent", "categoryLabel": "Urgente" },
  "clientName": "Ótica Central",
  "orderService": "4521",
  "note": null,
  "status": "open",
  "daysOpen": 1,
  "delayLevel": "attention",
  "createdBy": { "id": "6741a0c2f1d3a8b9c0e1f201", "name": "Ana Souza" },
  "createdAt": "2026-11-22T11:12:00.000Z",
  "outBy": null,
  "outAt": null,
  "outDate": null,
  "boxReleasedBy": null,
  "boxReleasedAt": null,
  "updatedAt": "2026-11-22T11:12:00.000Z",
  "canEdit": false,
  "canChangeBox": true,
  "undo": null
}
```

- `sheetDate` é a folha do lançamento. `box` é a caixa em que o serviço está, ou estava, como ela era quando o serviço entrou nela (no lançamento, na troca de caixa ou ao desfazer a liberação). Renumerar ou recolorir a caixa depois de liberada não muda o serviço. A caixa do lançamento fica no histórico.
- `daysOpen` e `delayLevel` vêm só no serviço aberto (`null` no que saiu). São calculados no servidor com a data de hoje (R4, RN-10): `daysOpen` conta os dias de calendário desde a folha, e lançado hoje é 0.
- `delayLevel` segue a D15. A vermelha sobe um nível antes, e lançada hoje já é `normal` (confirmado pelo Yuri em 2026-11-23). O web mostra o nível sempre com texto e ícone, nunca só pela cor.

  | Dias em aberto | Caixa comum | Caixa vermelha |
  |---|---|---|
  | 0 (hoje) | `neutral` | `normal` |
  | 1 (ontem) | `normal` | `attention` |
  | 2 | `attention` | `late` |
  | 3 ou mais | `late` | `late` |

- `outDate` é o dia da baixa (`AAAA-MM-DD`, no fuso da empresa), para agrupar a tela Baixas por dia. `outBy` e `boxReleasedBy` dizem quem deu baixa e quem liberou.
- `createdBy`, `outBy` e `boxReleasedBy` trazem o nome atual da pessoa.
- `canEdit` diz se quem está logado pode **editar ou excluir** o serviço (RN-11): o admin sempre; o operador, só o próprio lançamento e no mesmo dia (`sheetDate` igual a `serverDate`). Desde a versão 1.2, ele não vale mais para a troca de caixa.
- `canChangeBox` diz se quem está logado pode **trocar a caixa** do serviço (RN-12, D19). É `true` enquanto o serviço está aberto, para qualquer pessoa logada (operador ou admin), em qualquer dia e de qualquer autor. É `false` depois da baixa, para todos, inclusive o admin.
- Na tela, "Trocar caixa" (na Conferência e no detalhe, R14) aparece quando `canChangeBox` é `true`, e "Editar" e "Excluir" aparecem quando `canEdit` é `true`. No exemplo acima, quem está logado vê o serviço que Ana lançou num dia anterior: não edita, mas troca a caixa.
- `undo` (R7) é `{ "action": "checkout" | "release-box", "until": "…" }` quando quem está logado ainda pode desfazer a última ação do serviço: a liberação, se houve; senão a baixa. Para o operador, `until` é o fim da janela de 10 minutos, para a contagem regressiva; para o admin, `until` é `null` (sem prazo). Com `undo: null`, não há o que desfazer ou a pessoa não pode. A caixa reutilizada só é conferida na hora de desfazer (409).

### 5.2 `POST /api/movements`

Corpo:

```json
{ "boxId": "6741a0c2f1d3a8b9c0e1f310", "clientName": "Ótica Central", "orderService": "4521", "note": "aguardando armação", "clientRequestId": "0b7c3c1e-6f0e-4b8e-9a59-2f1d0c9e8a11" }
```

- Caixa e cliente obrigatórios; OS e observação opcionais (D14, RN-07). O serviço entra na folha de hoje (data do servidor), criada sozinha no primeiro lançamento do dia (RN-06).
- Numa transação: garante a folha, ocupa a caixa (só se estiver livre e ativa), cria o serviço e grava o histórico. Dois lançamentos simultâneos na mesma caixa: só um entra, e o outro recebe 409 `BOX_OCCUPIED` (RN-05).
- **Idempotência (R13):** `clientRequestId` é opcional e vale por usuário. Repetir a mesma chave devolve o resultado original (201, com o serviço como está agora), sem lançar de novo e sem falso `BOX_OCCUPIED`, também quando as duas tentativas chegam ao mesmo tempo. O web gera uma chave nova a cada lançamento e a repete só ao reenviar o mesmo.

**201**:

```json
{
  "movement": { "…": "Movement" },
  "warnings": [
    {
      "code": "DUPLICATE_ORDER_SERVICE",
      "message": "A OS 4521 já está na caixa 12 (Vermelha), aberta desde 22/11.",
      "movements": [
        {
          "id": "…",
          "box": { "id": "…", "number": "12", "color": "vermelha", "colorLabel": "Vermelha", "category": "urgent", "categoryLabel": "Urgente" },
          "sheetDate": "2026-11-22",
          "clientName": "Ótica Central",
          "createdBy": { "id": "…", "name": "Ana Souza" }
        }
      ]
    }
  ]
}
```

- `warnings` é sempre uma lista, vazia quando não há aviso.
- **OS repetida (D16, D26, RN-15):** se a OS já está em outro serviço aberto, o lançamento entra e a resposta avisa onde ela está (até 5 serviços). Com mais de um: "A OS 4521 já está em outros serviços abertos: caixa 12 (Vermelha), aberta desde 22/11; caixa 15 (Azul), aberta desde 23/11.".
  - Maiúsculas e minúsculas não diferenciam a OS (seção 1.2): lançar `a-77` avisa de um serviço aberto com `A-77`. A mensagem traz a OS como foi digitada agora.
  - OS de serviço que já saiu não gera aviso, e um serviço sem OS nunca conta como repetido.
- Para avisar enquanto a pessoa digita (R11), o web consulta antes `GET /api/movements?status=open&orderService=4521`, que compara a OS do mesmo jeito.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.boxId` ("Escolha a caixa."), `fields.clientName` ("Informe o cliente.", até 120), `fields.orderService` (até 40), `fields.note` (até 500), `fields.clientRequestId` ou campo a mais |
| 404 `NOT_FOUND` | "Caixa não encontrada.": não existe ou é de outra empresa |
| 409 `BOX_OCCUPIED` | "A caixa 12 já está ocupada: Ótica Central, lançado por Ana Souza em 22/11.", com `details.box` (Box, com o `currentMovement`). Se o serviço que está nela já saiu, a mensagem termina com "O serviço já saiu; falta liberar a caixa." |
| 409 `CONFLICT` | "A caixa 40 está desativada e não recebe serviço.", ou a chave repetida de um lançamento que já foi excluído ("Esse lançamento já foi feito e depois excluído.") |

### 5.3 `GET /api/movements`

Parâmetros, todos opcionais:

| Parâmetro | Valores |
|---|---|
| `status` | `open` (Conferência) ou `out` (Baixas) |
| `boxReleased` | `true` ou `false`. Só com `status=out`; `false` é "saiu, caixa não liberada" (R15) |
| `sort` | `priority`, `box`, `recent` ou `oldest` (abaixo) |
| `q` | Busca num campo só (R9), em todos os dias e situações (abaixo). Vazia é como não buscar |
| `orderService` | A OS inteira, sem distinguir maiúsculas de minúsculas (D26, aviso de OS repetida). Não aceita vazio |
| `color`, `category` | Cor ou categoria da caixa do serviço |
| `box` | Id da caixa: os serviços dela |
| `from`, `to` | Período da folha (`AAAA-MM-DD`, inclusive) |
| `outFrom`, `outTo` | Período do dia da baixa (`AAAA-MM-DD`, inclusive, no fuso da empresa). Só com `status=out` |
| `createdBy` | Id de quem lançou |
| `outBy` | Id de quem deu baixa. Só com `status=out` |
| `cursor`, `limit` | Paginação (seção 1). `limit` padrão 50, máximo 100 |

**Ordenações** (todas desempatam pelo `id`, então a ordem é estável entre as páginas):

| `sort` | Ordem |
|---|---|
| `priority` | Urgente (caixa vermelha) primeiro, depois o mais antigo (data da folha), depois o número da caixa em ordem natural (RN-10) |
| `box` | Só o número da caixa, em ordem natural, seguindo a prateleira |
| `recent` | Mais recente primeiro: pela hora do lançamento; com `status=out`, pela hora da baixa |
| `oldest` | Mais antigo primeiro: pela hora do lançamento; com `status=out`, pela hora da baixa |

Sem `sort`: `priority` com `status=open` (sem `q`); `recent` nos outros casos.

**Busca (`q`):**

- Só com dígitos: OS exata ou por prefixo (`45` acha 4521 e 4590) e o número exato da caixa (`12` acha a caixa 12, não a 120 nem a 012).
- Com outro texto: cliente por prefixo ou trecho, sem distinguir acento nem maiúscula (`sao joao` acha "Óptica São João"), e também OS por prefixo (para OS com letras). Na OS, maiúscula não conta, mas acento conta (D26): `a-7` acha "A-77", e `e-1` não acha "É-10".
- O texto é sempre tratado como literal: caracteres como `(`, `.` e `*` não viram expressão regular.

**200**:

```json
{ "items": [{ "…": "Movement" }], "nextCursor": "eyJzIjoicHJpb3JpdHkiLCJ2IjpbLi4uXX0", "serverDate": "2026-11-23" }
```

Cada item já responde onde o serviço está (R9): caixa, situação, dias em aberto ou dia da baixa, quem lançou e quando.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | Valor inválido (data que não existe, `limit` fora de 1 a 100, ordenação ou situação fora da lista), período com o fim antes do início (`fields.to`), filtro de baixa sem `status=out` ("Use este filtro junto com status=out."), cursor inválido ou parâmetro a mais |

### 5.4 `GET /api/movements/summary`

Os contadores da barra de navegação e da tela Hoje (R8, R15). **200**:

```json
{
  "serverDate": "2026-11-23",
  "counts": {
    "launchedToday": 58,
    "open": 42,
    "pendingFromPreviousDays": 30,
    "attention": 5,
    "late": 3,
    "outNotReleased": 4
  }
}
```

- `launchedToday`: lançados hoje, em qualquer situação; `open`: todos os pendentes; `pendingFromPreviousDays`: pendentes de folhas anteriores a hoje.
- `attention` e `late`: pendentes com esse nível de atraso (D15, com a vermelha subindo um nível). `late` alimenta o ponto vermelho da aba Conferência.
- `outNotReleased`: saíram e a caixa ainda não foi liberada (R15).

### 5.5 `GET /api/movements/:id`

**200**:

```json
{
  "movement": { "…": "Movement" },
  "history": [
    { "id": "…", "action": "movement.create", "at": "2026-11-23T11:12:00.000Z", "user": { "id": "…", "name": "Ana Souza" }, "before": null, "after": { "sheetDate": "2026-11-23", "box": { "id": "…", "number": "12", "color": "vermelha", "category": "urgent" }, "clientName": "Ótica Central", "orderService": "4521", "note": null } },
    { "id": "…", "action": "movement.checkout", "at": "2026-11-23T12:03:00.000Z", "user": { "id": "…", "name": "João Lima" }, "before": { "status": "open" }, "after": { "status": "out", "outAt": "2026-11-23T12:03:00.000Z" } },
    { "id": "…", "action": "movement.release_box", "at": "2026-11-23T12:04:00.000Z", "user": { "id": "…", "name": "João Lima" }, "before": { "boxReleasedAt": null }, "after": { "boxReleasedAt": "2026-11-23T12:04:00.000Z", "box": { "…": "…" } } }
  ],
  "serverDate": "2026-11-23"
}
```

`history` é a linha do tempo do serviço, do mais antigo ao mais recente, com as ações da seção 4 ("Lançado por Ana 08:12 · Baixa por João 23/11 09:03 · Caixa liberada por João 09:04"). **404** "Serviço não encontrado." se não existir, for de outra empresa ou tiver sido excluído (o excluído continua em `GET /api/audit`).

### 5.6 Correções: editar, excluir e trocar a caixa (RN-11, RN-12, D19)

Quem pode:

- **editar e excluir:** o admin, sempre; o operador, só o próprio lançamento e no mesmo dia (a folha do serviço é a de hoje). Fora disso: **403** "Você só pode alterar os seus próprios lançamentos, no mesmo dia.";
- **trocar a caixa:** qualquer pessoa logada, operador ou admin, em qualquer dia e de qualquer autor, enquanto o serviço estiver aberto (D19). Ninguém recebe 403 nesta rota por perfil, autoria ou dia; só vale o 403 de origem da seção 2, como em toda rota que altera dados.

Serviço inexistente, de outra empresa ou excluído: **404**.

**`PATCH /api/movements/:id`**, com pelo menos um destes campos:

```json
{ "clientName": "Óptica São João", "orderService": "4590", "note": null }
```

**200** `{ "movement": Movement, "warnings": [] }`. Mandar os mesmos valores não muda nada e não gera histórico. Mudar só maiúsculas e minúsculas da OS (`a-77` para `A-77`) é uma mudança: grava a OS nova e vai para o histórico (D26). Trocar a OS para uma que já está em outro serviço aberto avisa como no lançamento (D16). Erros: 400 (corpo vazio, campo inválido ou a mais), 403, 404.

**`DELETE /api/movements/:id`**: exclusão lógica. **204**. O serviço some das listas e da busca e continua no histórico. Se ainda estava com a caixa (aberto, ou saiu e a caixa não foi liberada), a caixa volta a ficar livre na mesma transação. Excluir de novo responde 404.

**`POST /api/movements/:id/change-box`**, com `{ "boxId": "…" }`: ocupa a caixa nova e libera a antiga numa transação, junto com o histórico (`movement.change_box`, com quem trocou, a caixa antiga e a nova) (RN-12).

- Só vale para serviço aberto. O que já saiu responde 409 para todos, inclusive o admin, e também depois de liberada a caixa.
- O serviço continua na folha do lançamento: `sheetDate`, `createdBy` e `daysOpen` não mudam.
- **200** `{ "movement": Movement }`, já com a caixa nova (a cor nova pode mudar o `delayLevel`).

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.boxId`: "Escolha a caixa nova." ou "Escolha uma caixa diferente da atual.", ou campo a mais |
| 404 `NOT_FOUND` | Serviço não encontrado, ou "Caixa não encontrada." (a nova não existe ou é de outra empresa) |
| 409 `BOX_OCCUPIED` | A caixa nova está ocupada, com `details.box`. Nada muda |
| 409 `CONFLICT` | "Só dá para trocar a caixa de um serviço aberto.", ou "A caixa 40 está desativada e não recebe serviço." |

Como qualquer pessoa troca a caixa (D19), duas ações ao mesmo tempo no mesmo serviço ficam mais comuns. A API resolve assim:

- **dois serviços para a mesma caixa nova:** só um entra, e o outro recebe 409 `BOX_OCCUPIED`;
- **o mesmo serviço para duas caixas diferentes:** as duas trocas valem, uma depois da outra. O serviço fica na caixa da última, as outras ficam livres e o histórico registra as duas;
- **troca e baixa do mesmo serviço:** se a baixa vem antes, a troca recebe 409; se a troca vem antes, a baixa acontece já na caixa nova.

### 5.7 Baixa e liberação (RN-08, RN-09, D6)

Sem corpo. Qualquer pessoa logada, em qualquer dia depois do lançamento, inclusive no mesmo dia.

- **`POST /api/movements/:id/checkout`**: marca como saído, com quem e quando. A caixa continua ocupada até ser liberada. **200** `{ "movement": Movement }`. **409** "Esse serviço já saiu.".
- **`POST /api/movements/:id/release-box`**: a caixa volta a ficar livre. **200** `{ "movement": Movement }`. **409** "Dê baixa antes de liberar a caixa." (D6) ou "A caixa desse serviço já foi liberada.".

As duas respondem 404 para serviço inexistente, de outra empresa ou excluído. "Saiu e liberar" de um serviço só usa o lote com um id (seção 5.8).

### 5.8 `POST /api/movements/batch`

Corpo:

```json
{ "ids": ["6741a0c2f1d3a8b9c0e1f420", "6741a0c2f1d3a8b9c0e1f421"], "action": "checkout-and-release", "clientRequestId": "lote-2c1f0c9e" }
```

| `action` | Em cada serviço |
|---|---|
| `checkout` | A baixa. Falha se já saiu |
| `release-box` | A liberação. Falha se ainda não saiu (D6) ou se já foi liberada |
| `checkout-and-release` | "Saiu e liberar" (D6): a baixa e a liberação juntas. Se o serviço já tinha saído (por outra pessoa, por exemplo), só libera a caixa. Falha se já saiu e a caixa já foi liberada |

**200**, com falha parcial permitida e um resultado por id, na ordem pedida:

```json
{
  "batchId": "6741b0c2f1d3a8b9c0e1f500",
  "action": "checkout-and-release",
  "results": [
    { "id": "6741a0c2f1d3a8b9c0e1f420", "ok": true, "movement": { "…": "Movement" } },
    { "id": "6741a0c2f1d3a8b9c0e1f421", "ok": false, "error": { "code": "CONFLICT", "message": "Esse serviço já saiu e a caixa já foi liberada." } }
  ],
  "summary": { "requested": 2, "succeeded": 1, "failed": 1 }
}
```

- Cada serviço roda na própria transação: uma falha não desfaz os outros. Os erros de item são `NOT_FOUND` ("Serviço não encontrado.": inexistente, de outra empresa ou excluído), `CONFLICT` (as mensagens da seção 5.7) e `DUPLICATE_IN_BATCH` ("Serviço repetido neste lote.").
- `batchId` identifica o lote para desfazê-lo inteiro (seção 5.9). As ações no histórico levam `after.batchId`.
- **Idempotência (R13):** repetir o mesmo `clientRequestId` (do mesmo usuário) devolve o mesmo `batchId` e os mesmos resultados, sem aplicar de novo; os serviços vêm como estão agora. Se a primeira tentativa ainda estiver em andamento: **409** "Esse lote ainda está sendo processado. Tente de novo em instantes.".
- Erros do lote inteiro: **400** `fields.ids` ("Escolha pelo menos um serviço.", "Escolha no máximo 100 serviços por lote.", `ids.N` com id inválido), `fields.action` ou campo a mais.
- Os itens são feitos em sequência. Um lote de 100 levou cerca de 1 s no ambiente local (seção 6.4); o web mostra o resultado de forma otimista (T2).

### 5.9 Desfazer (RN-11, D9, R7)

**`POST /api/movements/:id/undo`**, com `{ "action": "checkout" }` ou `{ "action": "release-box" }`.

- Quem pode: o operador, a própria ação em até 10 minutos; o admin, a qualquer tempo.
- Desfazer a liberação devolve a caixa ao serviço, desde que ela esteja livre, ativa e **não tenha sido reutilizada**: se a caixa recebeu outro serviço depois da liberação, mesmo que ele já tenha saído dela, a resposta é 409. Se a caixa foi renumerada enquanto estava livre, o serviço passa a mostrar o número novo.
- A baixa só se desfaz com a caixa ainda não liberada: desfaça a liberação primeiro.

**200** `{ "movement": Movement }`.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.action` inválida |
| 403 `FORBIDDEN` | "Você só pode desfazer as suas próprias ações." ou "O prazo de 10 minutos para desfazer já passou." |
| 404 `NOT_FOUND` | Serviço inexistente, de outra empresa ou excluído |
| 409 `CONFLICT` | "Esse serviço não tem baixa para desfazer.", "Desfaça primeiro a liberação da caixa.", "A caixa desse serviço não foi liberada.", "A caixa 12 já recebeu outro serviço. Não dá para desfazer a liberação." ou "A caixa 12 foi desativada. Não dá para desfazer a liberação." |

**`POST /api/movements/batch/:batchId/undo`**, sem corpo: desfaz o lote inteiro, item a item, com as mesmas regras. Em cada serviço, desfaz o que o lote fez, na ordem inversa (primeiro a liberação, depois a baixa).

- Quem pode: o autor do lote (cada item em até 10 minutos da ação) ou um admin. Outro operador: **403** "Só quem fez o lote pode desfazê-lo.". Lote inexistente ou de outra empresa: **404** "Lote não encontrado.".
- **200** `{ "batchId", "results", "summary" }`, no formato da seção 5.8, com os serviços que o lote mudou (os que falharam no lote não aparecem).
- Falhas por item, além das do desfazer: "Esse serviço mudou depois do lote." (alguém mexeu nele depois, por exemplo desfez e refez a liberação) e "Esse item do lote já foi desfeito.".

### 5.10 Folhas

**`GET /api/sheets`**, com `from`, `to` (`AAAA-MM-DD`), `cursor` e `limit` opcionais (padrão 31, máximo 100). **200**:

```json
{
  "sheets": [
    { "date": "2026-11-23", "counts": { "launched": 58, "out": 51, "open": 7 } },
    { "date": "2026-11-22", "counts": { "launched": 61, "out": 61, "open": 0 } }
  ],
  "nextCursor": null,
  "serverDate": "2026-11-23"
}
```

Os dias que têm folha, do mais recente. Os contadores são calculados por agregação: lançados, saíram e ainda abertos, sem os excluídos.

**`GET /api/sheets/:date`**, com `sort`, `cursor` e `limit` opcionais (como em `GET /api/movements`; sem `sort`, do mais recente). **200**:

```json
{
  "sheet": { "date": "2026-11-23", "counts": { "launched": 58, "out": 51, "open": 7 } },
  "items": [{ "…": "Movement" }],
  "nextCursor": null,
  "serverDate": "2026-11-23"
}
```

Um dia sem folha responde 200 com contadores zerados e `items: []`, o que serve para a tela Hoje antes do primeiro lançamento. Data inválida: **400**.

### 5.11 `GET /api/audit` (admin)

Parâmetros opcionais: `user` (id), `entity` (`Business`, `User`, `Box`, `MovementSheet` ou `Movement`), `entityId`, `from` e `to` (`AAAA-MM-DD`, no fuso da empresa), `cursor` e `limit`. **200**:

```json
{
  "items": [
    { "id": "…", "action": "movement.checkout", "entity": "Movement", "entityId": "…", "user": { "id": "…", "name": "João Lima" }, "before": { "status": "open" }, "after": { "status": "out", "outAt": "…" }, "at": "2026-11-23T12:03:00.000Z" }
  ],
  "nextCursor": null
}
```

Do mais recente para o mais antigo. `user` é `null` nas ações do sistema. Operador: **403**.

### 5.12 O que mudou em relação ao *planejado* da versão 1.0

- **Número da caixa (D18):** o zero à esquerda é preservado (`"007"` ≠ `"7"`), inclusive no filtro `?number=` e no cadastro em lote.
- **Movement:** sai `boxSnapshot`; `box` passa a ser a caixa como ela era quando o serviço entrou nela (com os rótulos). Entram `outDate` e `canEdit`. `undo.until` é `null` para o admin.
- **`GET /api/movements`:** sai `counts` da resposta; os contadores ficam em `GET /api/movements/summary`, que tem também atenção, pendentes de dias anteriores e "saiu, caixa não liberada". O período da baixa usa `outFrom` e `outTo` (o `from`/`to` é da folha). `boxReleased`, `outFrom`, `outTo` e `outBy` exigem `status=out`. Entram os filtros `box` e `orderService`.
- **Lote:** a resposta tem `action`, e o código de item repetido é `DUPLICATE_IN_BATCH`. Em `checkout-and-release`, o serviço que já tinha saído só tem a caixa liberada.
- **Folhas:** `GET /api/sheets` tem cursor (31 dias por página); `GET /api/sheets/:date` traz `nextCursor` e `serverDate`, e responde 200 com zeros num dia sem folha.
- **Histórico geral:** o filtro `entityId` entrou.

### 5.13 O que mudou na versão 1.2 (D19, onda 3)

- **`POST /api/movements/:id/change-box`:** era "autor no dia / admin" e passa a "logado". Qualquer pessoa logada troca a caixa de um serviço aberto, em qualquer dia e de qualquer autor (D19). Sai o 403 "Você só pode alterar os seus próprios lançamentos, no mesmo dia." desta rota.
- **O que continua:**
  - o serviço que já saiu não troca de caixa (409 `CONFLICT`);
  - a caixa nova ocupada responde 409 `BOX_OCCUPIED`;
  - a troca e o histórico entram na mesma transação;
  - serviço ou caixa de outra empresa responde 404.
- **Movement:** entra `canChangeBox` (booleano). `canEdit` continua com os mesmos valores, mas vale só para editar e excluir. A mudança é compatível: nenhum campo saiu nem mudou de tipo.
- **Para o web:** "Trocar caixa" aparece quando `canChangeBox` é `true`. Não use mais o `canEdit` para essa ação, porque ele esconde a troca de quem agora pode fazê-la e a mostra ao admin num serviço que já saiu (que responde 409).

### 5.14 `GET /api/clients/suggestions` (D24, onda 4)

Os nomes de cliente já usados na empresa, para o campo Cliente do Novo serviço e da edição (R12). O cliente é a ótica que manda o serviço, e o mesmo nome se repete. Qualquer pessoa logada usa, operador ou admin.

| Parâmetro | Valores |
|---|---|
| `q` | Obrigatório: o começo do nome, de 1 a 80 caracteres, sem contar os espaços das pontas |
| `limit` | Opcional: de 1 a 20; padrão 8 |

`GET /api/clients/suggestions?q=otica%20vi` → **200**:

```json
{
  "items": [
    { "name": "Ótica Visão Clara", "uses": 42, "lastUsedAt": "2026-11-23T14:02:00.000Z" },
    { "name": "ÓTICA VISÃO TOTAL", "uses": 17, "lastUsedAt": "2026-11-24T10:15:00.000Z" }
  ]
}
```

- **Busca:**
  - pelo **começo** do nome, sem distinguir acento nem maiúscula: `otica vi` e `Ótica Vi` acham "Ótica Visão Clara", mas `visao` não acha, porque o trecho do meio não conta;
  - os espaços nas pontas saem, e espaços repetidos contam como um;
  - o texto é literal: `(`, `[`, `.`, `*`, `+`, `|`, `^` e `$` não viram expressão regular.
- **Um item por nome:** grafias que só diferem em acento, maiúscula ou espaços repetidos são o mesmo cliente. `name` é a grafia do lançamento mais recente (no empate de hora, a menor grafia).
- **`uses`:** quantos serviços não excluídos têm o nome, em qualquer dia e situação (aberto ou que já saiu). Editar o cliente de um serviço leva o uso para o nome novo, e excluir o serviço tira o uso.
- **`lastUsedAt`:** a hora do lançamento mais recente com o nome. Se esse serviço for excluído, vale o anterior.
- **Ordem:** mais usados primeiro; no empate, o uso mais recente; depois o nome sem acento, em ordem alfabética.
- **Sem resultado:** se nenhum nome começa com o texto, a resposta é **200** `{ "items": [] }`. Não existe 404. Os nomes e as contagens são só da empresa da sessão.
- **Na hora:** um lançamento, uma edição do cliente ou uma exclusão já aparecem na consulta seguinte.

| Erro | Quando |
|---|---|
| 400 `VALIDATION_ERROR` | `fields.q`: "Digite o começo do nome do cliente." (ausente, vazio ou só espaços), "Use no máximo 80 caracteres na busca." ou "Envie a busca como texto." (`q` repetido). `fields.limit`: "Use um número de 1 a 20.". Parâmetro a mais, inclusive `business`: "Campo não permitido." |
| 401 `UNAUTHENTICATED` | Sem sessão |

**Desempenho.** Os nomes ficam num resumo: a coleção `clientnames`, com um documento por nome sem acento em cada empresa. Ele é mantido na mesma transação do lançamento, da edição do cliente e da exclusão, e refeito a partir dos serviços quando a API sobe (seção 6.1). A busca lê só os nomes que começam com o texto, e não os serviços. Por isso a primeira letra ("Ó", que pega quase todas as óticas) custa o mesmo que um nome inteiro, com um ano de dados ou com dez. Medido no servidor local com o `seed:demo`:

| Dados | `q` | p50 (ms) | p95 (ms) |
|---|---|---:|---:|
| Perfil `base` (21.900 serviços, 126 nomes) | `Ó` (pior caso) | 13,5 | 19,5 |
| Perfil `base` | Cada tecla de "Ótica Vis" e "Maria" | 12,7 | 16,0 |
| 219.000 serviços (10 vezes mais) | `Ó` | 14,0 | 20,7 |

Contar os usos na hora, direto nos serviços, custaria uma leitura por serviço do prefixo. Na primeira letra, com o perfil `base`, isso deu 79 ms (p50) e 170 ms (p95), e o tempo cresceria a cada ano de dados.

### 5.15 O que mudou na versão 1.3 (onda 4)

- **Rotas novas, de qualquer pessoa logada:**
  - `GET /api/clients/suggestions` (D24, seção 5.14);
  - `GET /api/users/options` (seção 3.16), pendência da F5 para o filtro "Quem deu baixa" do operador.
- **Rotas que já existiam:** nada mudou. Nenhum campo saiu nem mudou de tipo, e a gestão de usuários (`/api/users`, `/api/users/:id` e a redefinição de senha) continua só do admin.
- **Tamanho de `q` nas sugestões:** de 1 a 80 caracteres, o mesmo corte do campo Cliente no web. Acima disso, 400.
- **Banco:**
  - entra a coleção `clientnames`, o resumo dos nomes de cliente, derivado dos serviços;
  - entra nos serviços o índice parcial `{business, clientNameNormalized, createdAt, clientName}`, só dos não excluídos, que faz o recálculo do resumo sem ler documentos.

  Os dois são criados quando a API sobe, e o resumo de um banco que já tinha serviços é preenchido na mesma hora (seção 6.1).

### 5.16 O que mudou na versão 1.4 (D26, onda 5)

- **Comparação da OS:** maiúsculas e minúsculas deixam de diferenciar a OS (`a-77` = `A-77`, seção 1.2) em três lugares:
  - a busca (`q`) de `GET /api/movements`, pela OS inteira ou pelo começo dela;
  - o filtro `orderService` de `GET /api/movements`;
  - o aviso `DUPLICATE_ORDER_SERVICE` de `POST /api/movements` e de `PATCH /api/movements/:id`.
- **O que continua:**
  - a OS é devolvida como foi digitada, em todas as respostas e no histórico;
  - acentos, espaços do meio, pontuação e zeros à esquerda diferenciam a OS;
  - um serviço sem OS nunca conta como repetido.
- **Para o web:** nada muda. Nenhum campo, parâmetro ou formato saiu, entrou ou mudou de tipo.
- **Correção:** um caractere nulo (`%00`) em `q`, na busca e nas sugestões de cliente, respondia 500. Agora é um texto como qualquer outro.
- **Banco:**
  - entra nos serviços o campo interno `orderServiceNormalized`: a OS em minúsculas, ou `null` sem OS. Ele não sai em resposta nenhuma e não é aceito em corpo nem em consulta;
  - o índice `{business, orderServiceNormalized, orderService, _id}` entra no lugar de `{business, orderService}`, que sai porque nenhuma consulta usa mais.

  Um banco que já tinha serviços é migrado sozinho quando a API sobe (seção 6.1).

## 6. Rodar a API localmente

### 6.1 Banco

- O MongoDB precisa estar em **replica set**, porque cadastros e alterações usam transação (T6). Sem replica set, a API sobe fora de produção com um aviso: o login, o logout e as consultas funcionam, mas cadastros e alterações falham com 500. Em produção, ela não sobe. Para um `mongod` local: suba com `--replSet rs0` e rode uma vez `rs.initiate()` no `mongosh` (o passo a passo está no README).
- O banco de desenvolvimento se chama `lens-flow-dev`, o mesmo do `.env.example` (`DATABASE_NAME`).
- **Índices:** ao subir, a API sincroniza os índices com os models (`syncIndexes`): cria os que faltam e remove os que saíram do schema, inclusive índice criado à mão no banco. É isso que migra o banco da F2 para a D18: o índice único do número da caixa com colação numérica, que tratava "007" e "7" como iguais, vira um índice exato. Os documentos não mudam.
- **Resumo dos nomes de cliente (D24):**
  - **Na subida:** depois dos índices, e antes de responder, a API refaz a coleção `clientnames` a partir dos serviços não excluídos de cada empresa, numa transação (só com replica set).
  - **Para que serve:** preenche um banco que já tinha serviços antes da onda 4, como o `lens-flow-dev` e o `lens-flow-demo`, e corrige qualquer diferença.
  - **Tempo:** cerca de 0,2 s com um ano de dados (perfil `base`) e 0,5 s com dez vezes isso.
  - **Serviços gravados direto no banco**, sem passar pela API: o resumo precisa ser refeito. O `seed:demo` já faz isso. Um seed novo deve lançar pela API ou chamar `rebuildClientNames` (em `services/clientService.js`).
- **OS normalizada (D26):**
  - **Na subida:** depois dos índices, e antes de responder, a API confere o campo `orderServiceNormalized` de todos os serviços, preenche onde falta e corrige onde não bate com a OS. Não usa transação, então também roda sem replica set.
  - **Para que serve:** um banco de uma versão anterior, como o `lens-flow-dev` e o `lens-flow-demo`, passa a ignorar maiúsculas na OS sem passo manual. Também corrige uma OS gravada ou mudada direto no banco, ou por uma versão anterior da API.
  - **Se a API cair no meio:** a subida seguinte continua de onde parou. Rodar de novo não muda nada, e o `updatedAt` dos serviços não muda.
  - **Tempo:** com 219 mil serviços, cerca de 4 s na primeira subida e 0,6 s nas seguintes, em servidor local com o disco livre (com o disco ocupado por outra carga, a primeira chegou a 23 s).

### 6.2 Primeiro admin (`npm run seed:admin`)

Cria a empresa e o primeiro admin. Recusa se já houver admin ativo e não precisa de replica set. Opcionais: `SEED_ADMIN_USERNAME` (padrão `admin`), `SEED_ADMIN_NAME` e `SEED_BUSINESS_NAME`. A senha vem só de `SEED_ADMIN_PASSWORD`, nunca de argumento. Para ela não ficar no histórico do terminal, leia-a sem eco:

```bash
# bash (Git Bash, Linux, macOS)
read -rsp "Senha do primeiro admin: " SEED_ADMIN_PASSWORD; echo
export SEED_ADMIN_PASSWORD
npm run seed:admin
unset SEED_ADMIN_PASSWORD
```

```powershell
# PowerShell
$env:SEED_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Senha do primeiro admin' -AsSecureString)).Password
npm run seed:admin
Remove-Item Env:SEED_ADMIN_PASSWORD
```

### 6.3 Zerar o banco de desenvolvimento (D13)

Só no de desenvolvimento, nunca em produção: `mongosh "mongodb://127.0.0.1:27017/lens-flow-dev" --eval "db.dropDatabase()"`. Depois, rode o `seed:admin` de novo.

### 6.4 Dados de demonstração e desempenho (`npm run seed:demo`, R18)

Gera cerca de um ano de serviços numa empresa de demonstração e mede o tempo de resposta das listas principais por HTTP, com a API rodando no próprio processo, numa porta livre (não usa a 5000). Só roda num **banco vazio**, para nunca misturar com dados de verdade, e nunca com `NODE_ENV=production`. Passe o banco no próprio comando:

```bash
DATABASE_NAME=lens-flow-demo npm run seed:demo
DATABASE_NAME=lens-flow-demo-estresse SEED_DEMO_PROFILE=estresse npm run seed:demo
```

```powershell
$env:DATABASE_NAME = 'lens-flow-demo'; npm run seed:demo; Remove-Item Env:DATABASE_NAME
```

| Variável | Padrão | O que faz |
|---|---|---|
| `SEED_DEMO_PROFILE` | `base` | `base` (60 serviços por dia), `alto` (150) ou `estresse` (600) |
| `SEED_DEMO_PER_DAY` | do perfil | Serviços por dia, no lugar do perfil (o volume real do laboratório) |
| `SEED_DEMO_DAYS` | 365 | Dias de dados, terminando hoje |
| `SEED_DEMO_OPEN` | 300 | Pendentes na Conferência no fim, espalhados pelos últimos dias (todos os níveis de atraso) |
| `SEED_DEMO_NOT_RELEASED` | 20 | Serviços que saíram e esperam a liberação |
| `SEED_DEMO_PASSWORD` | aleatória | Senha dos usuários `demo-admin`, `demo-ana`, `demo-joao`, `demo-maria` e `demo-pedro`. Sem ela, a senha é aleatória e não é exibida. Leia-a sem eco, como na seção 6.2 |
| `SEED_DEMO_MEASURE` | `true` | `false` só gera os dados |
| `SEED_DEMO_SAMPLES` | 100 | Requisições medidas por lista |
| `SEED_DEMO_SEED` | 2026 | Semente do gerador (os mesmos dados a cada execução) |

A saída lista os dados criados e uma tabela com p50, p95 e máximo de cada lista (inclusive as sugestões de cliente a cada tecla e na primeira letra, e as opções de usuários), o tempo de um lote de 100 ("Saiu e liberar") e do desfazer desse lote, o teste do fluxo completo (lançar, conferir, baixa, liberar e reutilizar a caixa) e se a meta de p95 abaixo de 300 ms (seção 7 da especificação) foi atingida. Para apagar um banco de demonstração: `mongosh "mongodb://127.0.0.1:27017/lens-flow-demo" --eval "db.dropDatabase()"`.
