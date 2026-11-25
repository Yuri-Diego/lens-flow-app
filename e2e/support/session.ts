import { createHmac } from 'node:crypto'
import type { BrowserContext } from '@playwright/test'
import { TEST_JWT_SECRET, WEB_URL } from '../env'

export async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies(`${WEB_URL}/api`)
  return cookies.find((cookie) => cookie.name === 'lf_session')
}

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')

/**
 * Troca a sessão do navegador pela mesma sessão, vencida há 1 min (RN-14). O
 * prazo de 12 h fica dentro do token; com o segredo de teste dá para assinar o
 * token vencido sem esperar.
 */
export async function expireSession(context: BrowserContext): Promise<void> {
  const cookie = await sessionCookie(context)
  if (!cookie) throw new Error('Não há sessão para vencer.')
  const payload = JSON.parse(Buffer.from(cookie.value.split('.')[1], 'base64url').toString())
  const shift = payload.exp - Math.floor(Date.now() / 1000) + 60
  const expired = { ...payload, iat: payload.iat - shift, exp: payload.exp - shift }
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(expired)}`
  const signature = createHmac('sha256', TEST_JWT_SECRET).update(unsigned).digest('base64url')
  await context.addCookies([{ ...cookie, value: `${unsigned}.${signature}` }])
}
