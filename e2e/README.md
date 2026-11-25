# E2E do Lens Flow

Testes ponta a ponta com Playwright (T5), nos projetos `mobile` (Pixel 7) e `desktop` (Chromium). Como instalar e rodar está no [README da raiz](../README.md#e2e-e2e).

| Script | O que faz |
|---|---|
| `npm test` | Roda os dois projetos |
| `npm run test:mobile` · `npm run test:desktop` | Roda um projeto |
| `npx playwright test tests/review.spec.ts -g "lote"` | Roda parte dos testes |
| `npm run report` | Abre o último relatório (com o trace do que falhou) |
| `npm run lint` · `npm run typecheck` | ESLint e TypeScript |

## Como funciona

- **Servidores:** o `webServer` do `playwright.config.ts` sobe a API (`npm run start:e2e`, porta 5055, MongoDB em memória) e o site (`build` e `preview`, porta 4173). Se uma porta estiver ocupada, a execução para com erro.
- **Um laboratório por teste:** a fixture `lab` cria uma empresa nova com o conjunto fixo de `lens-flow-backend/scripts/e2eLab.js` (admin, dois operadores, caixas de todas as cores e pendentes de dias anteriores). Nenhum teste depende de outro.
- **Relógio:** `setServerNow` manda o cabeçalho `X-E2E-Now`, que fixa o relógio das regras só nas requisições daquele navegador. Assim dá para testar a meia-noite e o fim da janela de 10 min do desfazer. O cabeçalho só existe no `start:e2e`.
- **Sessão vencida:** `expireSession` troca o cookie pelo mesmo token já vencido, assinado com o segredo de teste.
- **IP por teste:** cada teste manda o próprio `X-Forwarded-For`, para o limite de logins errados por IP não vazar entre testes.
- **Seletores:** papéis e rótulos acessíveis, os mesmos que o leitor de tela usa.
- **Sem novas tentativas:** `retries: 0`, para teste instável aparecer.

As senhas e o segredo em `env.ts` são valores só de teste.
