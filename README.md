# Lens Flow

Site para um laboratório de surfaçagem acompanhar os serviços por caixas: uma folha por dia, baixa do serviço e liberação da caixa, com registro de quem fez cada coisa. As regras do produto estão em [`docs/produto/ESPECIFICACAO.md`](docs/produto/ESPECIFICACAO.md), e a API em [`docs/api/CONTRATO.md`](docs/api/CONTRATO.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `lens-flow-backend/` | API Node/Express 5 + MongoDB (Mongoose), ESM |
| `lens-flow-web/` | Site React 19 + TypeScript + Vite + Tailwind + TanStack Query, pensado primeiro para celular |
| `e2e/` | Testes ponta a ponta (Playwright), em celular e desktop |
| `lens-flow/` | App Expo **congelado** (decisão D1). Fora do CI; não alterar |
| `docs/` | Especificação, pipeline, pesquisa do ramo e contrato da API |
| `.github/workflows/ci.yml` | CI: lint, typecheck, testes, build e E2E em push e PR para `dev` e `main` |

Não há workspace na raiz: cada subprojeto tem o próprio `package.json` e `package-lock.json`, e os comandos rodam dentro da pasta dele.

## Requisitos

- Node 24 (versão em [`.nvmrc`](.nvmrc); com nvm, rode `nvm use` na raiz).
- MongoDB em **replica set** para rodar a API localmente, porque cadastros e alterações usam transações (T6). Serve o MongoDB Atlas ou um `mongod` local em replica set (veja abaixo).
- Os testes **não** precisam de MongoDB instalado nem de `.env`: eles sobem um replica set em memória.

## Backend (`lens-flow-backend/`)

### Primeira vez

```bash
cd lens-flow-backend
npm ci
cp .env.example .env   # preencha os valores; o .env nunca é versionado
```

A API não sobe sem `DATABASE_URL`, `DATABASE_NAME`, `JWT_SECRET` e `CORS_ORIGINS`, nem sem conseguir conectar no banco. Nesse caso ela encerra e lista o que falta.

### MongoDB local em replica set

Sem replica set, a API sobe fora de produção com um aviso: o login e as consultas funcionam, mas cadastros e alterações (usuários, caixas, troca de senha) falham. Em produção, ela não sobe.

```bash
# Suba o mongod em replica set (deixe este terminal aberto)
mongod --replSet rs0 --dbpath <pasta-de-dados>

# Em outro terminal, só na primeira vez: inicie o replica set
mongosh --eval 'rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:27017" }] })'

# Conferir: deve imprimir 1
mongosh --quiet --eval "rs.status().ok"
```

Um `rs.initiate()` sem argumentos também funciona. O `host` explícito evita problema quando o nome da máquina não resolve.

Se o MongoDB roda como serviço do Windows, acrescente no `mongod.cfg` o trecho abaixo, reinicie o serviço e rode o `rs.initiate(...)` uma vez:

```yaml
replication:
  replSetName: rs0
```

### Primeiro admin (`npm run seed:admin`)

Não existe cadastro aberto (D2): o primeiro admin é criado por script, que também cria a empresa. A senha vem só da variável `SEED_ADMIN_PASSWORD`, de 8 a 64 caracteres, e nunca de argumento. Opcionais:

- `SEED_ADMIN_USERNAME`, com padrão `admin`;
- `SEED_ADMIN_NAME`, com padrão `Administrador`;
- `SEED_BUSINESS_NAME`, com padrão `Laboratório`.

O script usa `DATABASE_URL` e `DATABASE_NAME` do ambiente ou do `.env`, e não precisa de replica set. Se já houver um admin ativo, ele recusa e não altera nada.

Para a senha não ficar no histórico do terminal, leia-a sem eco:

```bash
# bash (Git Bash, Linux, macOS)
read -rsp "Senha do primeiro admin: " SEED_ADMIN_PASSWORD; echo
export SEED_ADMIN_PASSWORD
SEED_ADMIN_USERNAME=yuri SEED_ADMIN_NAME="Yuri" npm run seed:admin
unset SEED_ADMIN_PASSWORD
```

```powershell
# PowerShell
$env:SEED_ADMIN_PASSWORD = [Net.NetworkCredential]::new('', (Read-Host 'Senha do primeiro admin' -AsSecureString)).Password
npm run seed:admin
Remove-Item Env:SEED_ADMIN_PASSWORD
```

### Subir a API

```bash
npm run dev            # API com recarga automática em http://localhost:5000
```

Todas as rotas ficam sob `/api` (T3), e todas exigem login, menos a saúde, o login e o logout. Para conferir se a API está no ar, `GET http://localhost:5000/api/health` deve responder `{"status":"ok"}`. O `/health`, sem `/api`, existe para a infraestrutura.

Ao subir, a API deixa os índices do banco iguais aos declarados nos models (`syncIndexes`): cria os que faltam e **remove os que não estão nos models**.
- Não crie índice à mão no banco: ele some na próxima subida.
- Num banco da F2, a primeira subida troca o índice único das caixas para a comparação exata (D18: "007" e "7" são caixas diferentes).

Com replica set, a subida também refaz o resumo dos nomes de cliente (`ClientName`), que alimenta as sugestões do campo Cliente (D24). Ele é montado a partir dos serviços que já estão no banco, antes de a API começar a responder. O `seed:demo` deixa esse resumo pronto.

### Zerar o banco de desenvolvimento (D13)

Os dados antigos do banco de desenvolvimento são de teste e não servem no esquema novo (cor em hex, empresa com senha, folha com lista de serviços). Para zerar:

```bash
mongosh "mongodb://127.0.0.1:27017/lens-flow-dev" --eval "db.dropDatabase()"
```

- `lens-flow-dev` é o nome do banco no `.env.example`. Se o `DATABASE_NAME` do seu `.env` for outro, troque no comando.
- O comando apaga tudo daquele banco: use só no de desenvolvimento, nunca em produção.
- Depois, rode o `npm run seed:admin` de novo.

### Dados de demonstração (`npm run seed:demo`)

O `seed:demo` cria uma empresa de demonstração com cerca de um ano de serviços e mede, por HTTP, o tempo de resposta das listas principais. A meta é p95 abaixo de 300 ms (seção 7 da especificação).

Ele precisa de replica set e só roda num banco **vazio**, para nunca misturar com dados de verdade. Por isso, passe outro banco no próprio comando, sem mudar o `.env`:

```bash
# bash
DATABASE_NAME=lens-flow-demo npm run seed:demo
```

```powershell
# PowerShell
$env:DATABASE_NAME = 'lens-flow-demo'; npm run seed:demo; Remove-Item Env:DATABASE_NAME
```

- `SEED_DEMO_PROFILE` escolhe o volume: `base` (60 serviços por dia, o padrão), `alto` (150) ou `estresse` (600). As outras variáveis `SEED_DEMO_*` estão no `.env.example`.
- Os usuários `demo-*` só conseguem entrar se você passar `SEED_DEMO_PASSWORD`. Sem ela, a senha é aleatória.
- Para apagar o banco de demonstração: `mongosh "mongodb://127.0.0.1:27017/lens-flow-demo" --eval "db.dropDatabase()"`.

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com `nodemon` (recarrega ao salvar) |
| `npm start` | Sobe a API com `node server.js` (uso em produção) |
| `npm run seed:admin` | Cria a empresa e o primeiro admin |
| `npm run seed:demo` | Cria dados de demonstração num banco vazio e mede o p95 das listas |
| `npm run start:e2e` | Sobe a API dos testes ponta a ponta na porta 5055, com banco em memória e dados fixos |
| `npm test` | Roda os testes uma vez (Vitest + Supertest + `mongodb-memory-server`) |
| `npm run lint` | ESLint (flat config em `eslint.config.js`) |

### Organização

- `app.js` exporta `createApp(config)`, que monta o Express sem banco e sem `listen`. É o que os testes usam.
- `server.js` valida o ambiente (`config/env.js`), conecta no banco, cria os índices, confere o replica set e escuta na porta.
- As camadas são `routes/ → controllers/ → services/ → models/`.
- As outras pastas:
  - `middlewares/`: sessão, perfil, erros, limites de tentativas e checagem de origem;
  - `validation/`: schemas zod de toda entrada;
  - `domain/`: cores, categorias, números de caixa e regras do serviço;
  - `utils/`: datas no fuso `America/Sao_Paulo` e o relógio das regras (`utils/clock.js`);
  - `scripts/`: os seeds do admin e de demonstração e a API do E2E (`startE2e.js`).
- `tests/` guarda os testes (`*.test.js`). Os helpers ficam em `tests/helpers/`:
  - `db.js`, com `useTestDb()`, sobe o replica set em memória, limpa as coleções entre os testes e derruba no fim;
  - `app.js` cria o app com uma configuração de teste fixa e as fábricas de empresa e usuário;
  - `movements.js` chama a API com a sessão de um usuário, cria caixas, lança serviços e fixa a hora do relógio (`setNow`). Os testes trocam o `clock.now` em vez do `Date` global.

Na primeira execução, os testes baixam o binário do MongoDB (a versão fica em `config.mongodbMemoryServer.version` no `package.json`). Depois ele fica em cache.

### Variáveis de ambiente

Os valores de exemplo estão em `lens-flow-backend/.env.example`.

| Tipo | Variáveis |
|---|---|
| Obrigatórias | `DATABASE_URL`, `DATABASE_NAME`, `JWT_SECRET` (em produção, pelo menos 32 caracteres), `CORS_ORIGINS` |
| Com padrão | `PORT` (5000), `NODE_ENV` (`development`; em `production`, o cookie da sessão é `Secure`) |
| Opcionais | `TRUST_PROXY` (atrás de proxy reverso), `BCRYPT_ROUNDS` |
| Só do seed do admin | `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_NAME`, `SEED_BUSINESS_NAME` |
| Só do `start:e2e` | `E2E_API_PORT`, `E2E_WEB_ORIGIN`, `E2E_JWT_SECRET`, `E2E_PASSWORD` (todas com padrão; o Playwright as define) |
| Só do seed de demonstração | `SEED_DEMO_PROFILE`, `SEED_DEMO_PASSWORD` e as outras `SEED_DEMO_*` do `.env.example` |

## Web (`lens-flow-web/`)

O site tem login de verdade contra a API. Para testar localmente:

1. Suba o MongoDB em replica set e a API (`npm run dev` em `lens-flow-backend/`), com um admin criado pelo `npm run seed:admin`.
2. Em outro terminal, suba o site:

   ```bash
   cd lens-flow-web
   npm ci
   npm run dev            # http://localhost:5173
   ```

3. Abra http://localhost:5173 e entre com o usuário e a senha do admin.

O Vite faz o proxy de `/api` para a API em http://localhost:5000. Assim, o site e a API ficam na mesma origem, como em produção (T3), e o cookie da sessão (`Path=/api`) funciona.
- Mantenha `http://localhost:5173` em `CORS_ORIGINS` no `.env` da API (é o valor do `.env.example`), porque a API confere a origem das requisições que alteram dados.
- A porta 5173 é fixa: se estiver ocupada, o Vite para com erro em vez de trocar de porta.

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento do Vite, com o proxy de `/api` |
| `npm run typecheck` | Checa os tipos (`tsc --noEmit`) |
| `npm run build` | Checa os tipos e gera o build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm test` | Roda os testes uma vez (Vitest + Testing Library + jsdom) |
| `npm run lint` | ESLint |

Organização:

- `src/app/`: provedores, rotas, layout e navegação;
- `src/features/`: telas e dados de cada área (`auth`, `boxes`, `clients`, `movements`, `sheets`, `users`);
- `src/components/ui/`: componentes de interface reaproveitados;
- `src/lib/`: cliente da API, sessão, rascunho de formulário e aviso de falta de rede;
- `src/index.css`: tokens de design. As cores das caixas (`--color-box-*`) são provisórias até chegarem as fotos das caixas (R10);
- o alias `@` aponta para `src/`.

Os testes ficam ao lado do código (`*.test.ts` e `*.test.tsx`), e o setup em `src/test/setup.ts`.

### Variáveis de ambiente

Só uma, opcional: `LENS_FLOW_API_PORT`, a porta da API no proxy de `/api` (padrão 5000), lida do ambiente do terminal. O exemplo está em `lens-flow-web/.env.example`.

## E2E (`e2e/`)

Os testes ponta a ponta usam o site como as pessoas usam, no Playwright, em dois projetos: `mobile` (Pixel 7) e `desktop` (Chromium).

```bash
# Uma vez: as dependências das três pastas e o navegador
npm --prefix lens-flow-backend ci
npm --prefix lens-flow-web ci
cd e2e
npm ci
npx playwright install chromium

npm test                 # os dois projetos
npm run test:mobile      # só o celular
npm run report           # abre o último relatório
```

O Playwright sobe tudo sozinho, em portas próprias, e derruba no fim:

| O quê | Porta | Como |
|---|---|---|
| API | 5055 | `npm run start:e2e` em `lens-flow-backend/`, com um MongoDB em memória |
| Site | 4173 | `npm run build` e `npm run preview` em `lens-flow-web/` |

Não precisa de MongoDB instalado nem de `.env`, e não encosta nos bancos `lens-flow-dev` e `lens-flow-demo`. Como os testes usam bastante a máquina, é melhor rodar com a API, o site e o `mongod` de desenvolvimento desligados. Os detalhes estão em [`e2e/README.md`](e2e/README.md).

## CI

O workflow `.github/workflows/ci.yml` roda em `push` e `pull_request` para `dev` e `main`:

- `changes` decide o que rodar a partir dos arquivos alterados (`dorny/paths-filter`). Um subprojeto sem mudança tem o job pulado, e mudar o próprio workflow ou o `.nvmrc` roda tudo;
- `backend`: `npm ci`, `npm run lint`, `npm test` (com cache do npm e do binário do MongoDB);
- `web`: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`;
- `e2e`: instala as três pastas, roda o lint e o typecheck de `e2e/` e os testes ponta a ponta (com cache do navegador e do binário do MongoDB). Roda quando o backend, o web, o `e2e/` ou o workflow mudam. Se falhar, publica o relatório do Playwright como artefato (`playwright-report`);
- `CI`: resumo que passa se cada job passou ou foi pulado. É a verificação indicada para a proteção de branch.

Para reproduzir o CI localmente, rode os mesmos comandos dentro de cada subprojeto.

## Branches e commits

- `main` é produção e só recebe merge de `dev` por PR;
- `dev` é a integração; o trabalho novo sai de `dev` em `feat/*`, `fix/*`, `test/*`, `ci/*` ou `chore/*` e volta por PR;
- mensagens no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`).
