# Lens Flow

Site para um laboratório de surfaçagem acompanhar os serviços por caixas: uma folha por dia, baixa do serviço e liberação da caixa, com registro de quem fez cada coisa. As regras do produto estão em [`docs/produto/ESPECIFICACAO.md`](docs/produto/ESPECIFICACAO.md), e a API em [`docs/api/CONTRATO.md`](docs/api/CONTRATO.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `lens-flow-backend/` | API Node/Express 5 + MongoDB (Mongoose), ESM |
| `lens-flow-web/` | Site React 19 + Vite + Tailwind, pensado primeiro para celular |
| `lens-flow/` | App Expo **congelado** (decisão D1). Fora do CI; não alterar |
| `docs/` | Especificação, pipeline, pesquisa do ramo e contrato da API |
| `.github/workflows/ci.yml` | CI: lint, testes e build em push e PR para `dev` e `main` |

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

### Zerar o banco de desenvolvimento (D13)

Os dados antigos do banco de desenvolvimento são de teste e não servem no esquema novo (cor em hex, empresa com senha, folha com lista de serviços). Para zerar:

```bash
mongosh "mongodb://127.0.0.1:27017/lens-flow-dev" --eval "db.dropDatabase()"
```

- Use no lugar de `lens-flow-dev` o nome do banco que está em `DATABASE_NAME` no seu `.env`. O `.env.example` sugere `lens-flow`.
- O comando apaga tudo daquele banco: use só no de desenvolvimento, nunca em produção.
- Depois, rode o `npm run seed:admin` de novo.

### Scripts

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com `nodemon` (recarrega ao salvar) |
| `npm start` | Sobe a API com `node server.js` (uso em produção) |
| `npm run seed:admin` | Cria a empresa e o primeiro admin |
| `npm test` | Roda os testes uma vez (Vitest + Supertest + `mongodb-memory-server`) |
| `npm run lint` | ESLint (flat config em `eslint.config.js`) |

### Organização

- `app.js` exporta `createApp(config)`, que monta o Express sem banco e sem `listen`. É o que os testes usam.
- `server.js` valida o ambiente (`config/env.js`), conecta no banco, cria os índices, confere o replica set e escuta na porta.
- As camadas são `routes/ → controllers/ → services/ → models/`.
- As outras pastas:
  - `middlewares/`: sessão, perfil, erros, limites de tentativas e checagem de origem;
  - `validation/`: schemas zod de toda entrada;
  - `domain/`: cores, categorias e números de caixa;
  - `scripts/`: o seed.
- `tests/` guarda os testes (`*.test.js`). Os helpers ficam em `tests/helpers/`:
  - `db.js`, com `useTestDb()`, sobe o replica set em memória, limpa as coleções entre os testes e derruba no fim;
  - `app.js` cria o app com uma configuração de teste fixa e as fábricas de empresa e usuário.

Na primeira execução, os testes baixam o binário do MongoDB (a versão fica em `config.mongodbMemoryServer.version` no `package.json`). Depois ele fica em cache.

### Variáveis de ambiente

Os valores de exemplo estão em `lens-flow-backend/.env.example`.

| Tipo | Variáveis |
|---|---|
| Obrigatórias | `DATABASE_URL`, `DATABASE_NAME`, `JWT_SECRET` (em produção, pelo menos 32 caracteres), `CORS_ORIGINS` |
| Com padrão | `PORT` (5000), `NODE_ENV` (`development`; em `production`, o cookie da sessão é `Secure`) |
| Opcionais | `TRUST_PROXY` (atrás de proxy reverso), `BCRYPT_ROUNDS` |
| Só do seed | `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_NAME`, `SEED_BUSINESS_NAME` |

## Web (`lens-flow-web/`)

> **Até a F4, o site abre mas fica sem dados.** As rotas antigas da API saíram e tudo foi para `/api`, com login. A F4 refaz o acesso do site à API.

```bash
cd lens-flow-web
npm ci
npm run dev            # http://localhost:5173
```

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento do Vite |
| `npm run build` | Build de produção em `dist/` |
| `npm run preview` | Serve o build localmente |
| `npm test` | Roda os testes uma vez (Vitest + Testing Library + jsdom) |
| `npm run lint` | ESLint |

Os testes ficam ao lado do código (`*.test.jsx`), e o setup em `src/test/setup.js`.

## CI

O workflow `.github/workflows/ci.yml` roda em `push` e `pull_request` para `dev` e `main`:

- `changes` decide o que rodar a partir dos arquivos alterados (`dorny/paths-filter`). Um subprojeto sem mudança tem o job pulado, e mudar o próprio workflow ou o `.nvmrc` roda tudo;
- `backend`: `npm ci`, `npm run lint`, `npm test` (com cache do npm e do binário do MongoDB);
- `web`: `npm ci`, `npm run lint`, `npm test`, `npm run build`;
- `CI`: resumo que passa se cada job passou ou foi pulado. É a verificação indicada para a proteção de branch.

Para reproduzir o CI localmente, rode os mesmos comandos dentro de cada subprojeto.

## Branches e commits

- `main` é produção e só recebe merge de `dev` por PR;
- `dev` é a integração; o trabalho novo sai de `dev` em `feat/*`, `fix/*`, `test/*`, `ci/*` ou `chore/*` e volta por PR;
- mensagens no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`).
