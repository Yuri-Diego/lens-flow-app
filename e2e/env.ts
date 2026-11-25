/**
 * Portas e credenciais do E2E. São valores só de teste: o banco nasce em
 * memória a cada execução e some no fim. Nada aqui vem do .env.
 */
export const API_PORT = 5055
export const WEB_PORT = 4173

// 127.0.0.1 (e não localhost) para o IPv4/IPv6 não variar entre Windows e Linux.
export const API_URL = `http://127.0.0.1:${API_PORT}`
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`

export const TEST_PASSWORD = 'senha-e2e-123'
/** Também assina a sessão vencida do cenário de expiração (support/session.ts). */
export const TEST_JWT_SECRET = 'segredo-so-para-o-e2e-com-mais-de-32-caracteres'

export const TIME_ZONE = 'America/Sao_Paulo'
