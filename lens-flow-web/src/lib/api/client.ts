import axios from 'axios'
import { ApiError, normalizeApiError } from './errors'
import { reportServerReachable, reportServerUnreachable } from '@/lib/network/connectivity'

/**
 * Cliente da API. Sempre pela mesma origem, em `/api` (T3): no desenvolvimento
 * o Vite faz o proxy, e o cookie de sessão (`Path=/api`) vai junto.
 */
export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

type UnauthenticatedHandler = (error: ApiError) => void

let unauthenticatedHandler: UnauthenticatedHandler | null = null

/** O `AuthProvider` registra aqui o que fazer quando a sessão cai (401). */
export function setUnauthenticatedHandler(handler: UnauthenticatedHandler | null): void {
  unauthenticatedHandler = handler
}

// O login responde 401 INVALID_CREDENTIALS, que não é sessão vencida.
const SESSION_EXEMPT_URLS = ['/auth/login', '/auth/logout']

api.interceptors.response.use(
  (response) => {
    reportServerReachable()
    return response
  },
  (rawError: unknown) => {
    const error = normalizeApiError(rawError)

    if (error.isNetworkError) {
      reportServerUnreachable()
    } else if (error.status !== null) {
      reportServerReachable()
    }

    const url = axios.isAxiosError(rawError) ? (rawError.config?.url ?? '') : ''
    if (error.code === 'UNAUTHENTICATED' && !SESSION_EXEMPT_URLS.includes(url)) {
      unauthenticatedHandler?.(error)
    }

    return Promise.reject(error)
  },
)
