# Lens Flow

Site para um laboratório de surfaçagem acompanhar os serviços por caixas: uma folha por dia, baixa do serviço e liberação da caixa, com registro de quem fez cada coisa. As regras do produto estão em [`docs/produto/ESPECIFICACAO.md`](docs/produto/ESPECIFICACAO.md).

## Estrutura

| Pasta | O que é |
|---|---|
| `lens-flow-backend/` | API Node/Express + MongoDB (Mongoose), ESM |
| `lens-flow-web/` | Site React 19 + Vite + Tailwind, pensado primeiro para celular |
| `lens-flow/` | App Expo **congelado** (decisão D1). Fora do CI; não alterar |
| `docs/` | Especificação, pipeline e (a partir da F2) contrato da API |
| `.github/workflows/ci.yml` | CI: lint, testes e build em push e PR para `dev` e `main` |

Não há workspace na raiz: cada subprojeto tem o próprio `package.json` e `package-lock.json`, e os comandos rodam dentro da pasta dele.

## Requisitos

- Node 24 (versão em [`.nvmrc`](.nvmrc); com nvm, rode `nvm use` na raiz).
- MongoDB em **replica set** para rodar a API localmente, porque as operações de caixa usam transações. Serve o MongoDB Atlas ou um `mongod --replSet rs0` local (depois de subir, rode `rs.initiate()` uma vez no `mongosh`).
- Os testes **não** precisam de MongoDB instalado nem de `.env`: eles sobem um replica set em memória.

## Backend (`lens-flow-backend/`)

```bash
cd lens-flow-backend
npm ci
cp .env.example .env   # preencha os valores; o .env nunca é versionado
npm run dev            # API com recarga automática em http://localhost:5000
```

Para conferir se a API está no ar: `GET http://localhost:5000/health` deve responder `{"status":"ok"}`.

| Script | O que faz |
|---|---|
| `npm run dev` | Sobe a API com `nodemon` (recarrega ao salvar) |
| `npm start` | Sobe a API com `node server.js` (uso em produção) |
| `npm test` | Roda os testes uma vez (Vitest + Supertest + `mongodb-memory-server`) |
| `npm run lint` | ESLint (flat config em `eslint.config.js`) |

Organização:

- `app.js` monta e exporta o Express (sem banco e sem `listen`), e é isso que os testes importam;
- `server.js` carrega o `.env`, conecta no banco e escuta na porta;
- camadas `routes/ → controllers/ → services/ → models/`;
- `tests/`: testes (`*.test.js`); `tests/helpers/db.js` sobe o replica set em memória, limpa as coleções entre os testes e derruba no fim (`useTestDb()`).

Na primeira execução, os testes baixam o binário do MongoDB (a versão fica em `config.mongodbMemoryServer.version` no `package.json`). Depois ele fica em cache.

Variáveis de ambiente (veja `lens-flow-backend/.env.example`): `PORT`, `DATABASE_URL`, `DATABASE_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `NODE_ENV`.

## Web (`lens-flow-web/`)

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

- `changes` decide o que rodar a partir dos arquivos alterados (`dorny/paths-filter`); mudar o próprio workflow ou o `.nvmrc` roda tudo;
- `backend`: `npm ci`, `npm run lint`, `npm test` (com cache do npm e do binário do MongoDB);
- `web`: `npm ci`, `npm run lint`, `npm test`, `npm run build`;
- `CI`: resumo que passa se cada job passou ou foi pulado. É a verificação indicada para a proteção de branch.

Para reproduzir o CI localmente, rode os mesmos comandos dentro de cada subprojeto.

## Branches e commits

- `main` é produção e só recebe merge de `dev` por PR;
- `dev` é a integração; o trabalho novo sai de `dev` em `feat/*`, `fix/*`, `test/*`, `ci/*` ou `chore/*` e volta por PR;
- mensagens no padrão Conventional Commits (`feat:`, `fix:`, `test:`, `ci:`, `docs:`, `chore:`).
