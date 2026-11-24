import { render } from '@testing-library/react'
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { api } from '@/lib/api'
import { Providers } from '@/app/Providers'
import { createQueryClient } from '@/app/queryClient'
import { routes as appRoutes } from '@/app/routes'

type Reply = { status: number; data?: unknown; headers?: Record<string, string> } | 'network-error'
type Handler = (config: InternalAxiosRequestConfig) => Reply | Promise<Reply>

/**
 * Troca o adaptador do axios por respostas falsas, por "MÉTODO /rota".
 * Rota sem resposta definida responde 404, para o teste falhar alto.
 */
export function mockApi(handlers: Record<string, Reply | Handler>) {
  const calls: Array<{ method: string; url: string; data: unknown }> = []

  api.defaults.adapter = async (config) => {
    const method = (config.method ?? 'get').toUpperCase()
    const url = config.url ?? ''
    const data = typeof config.data === 'string' ? JSON.parse(config.data) : config.data
    calls.push({ method, url, data })

    const handler = handlers[`${method} ${url}`]
    const reply: Reply = typeof handler === 'function' ? await handler(config) : (handler ?? { status: 404 })

    if (reply === 'network-error') {
      throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
    }

    const response: AxiosResponse = {
      data: reply.data ?? '',
      status: reply.status,
      statusText: String(reply.status),
      headers: new AxiosHeaders(reply.headers ?? {}),
      config,
    }
    if (reply.status >= 400) {
      throw new AxiosError(`HTTP ${reply.status}`, AxiosError.ERR_BAD_RESPONSE, config, null, response)
    }
    return response
  }

  return { calls }
}

export const adminUser = {
  id: '6741a0c2f1d3a8b9c0e1f201',
  name: 'Ana Souza',
  username: 'ana',
  role: 'admin' as const,
  business: { id: '6741a0c2f1d3a8b9c0e1f200', name: 'Laboratório Teste' },
}

export const operatorUser = { ...adminUser, id: '6741a0c2f1d3a8b9c0e1f202', name: 'João Lima', username: 'joao', role: 'operator' as const }

export const unauthenticated = (message = 'Entre com seu usuário e senha para continuar.') => ({
  status: 401,
  data: { error: { code: 'UNAUTHENTICATED', message } },
})

/** Renderiza o app inteiro (ou outras rotas) num roteador em memória. */
export function renderApp(initialPath: string, routes: RouteObject[] = appRoutes) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] })
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false } })
  const result = render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  )
  return { ...result, router, client }
}
