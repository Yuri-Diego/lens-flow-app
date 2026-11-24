import { render } from '@testing-library/react'
import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { api, type Box, type BoxColor, type Movement, type MovementSummary } from '@/lib/api'
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

export const SERVER_DATE = '2026-11-23'

const COLOR_INFO = {
  branca: ['Branca', 'without_assembly', 'Sem montagem'],
  preta: ['Preta', 'without_assembly', 'Sem montagem'],
  verde: ['Verde', 'with_assembly', 'Com montagem'],
  amarela: ['Amarela', 'with_assembly', 'Com montagem'],
  vermelha: ['Vermelha', 'urgent', 'Urgente'],
  azul: ['Azul', 'with_treatment', 'Com tratamento'],
} as const

let sequence = 0
function nextId(): string {
  sequence += 1
  return `6741a0c2f1d3a8b9c0e1${sequence.toString(16).padStart(4, '0')}`
}

/** Uma caixa do contrato (seção 1.3), livre por padrão. */
export function makeBox(overrides: Partial<Box> & { number: string; color?: BoxColor }): Box {
  const color = overrides.color ?? 'azul'
  const [colorLabel, category, categoryLabel] = COLOR_INFO[color]
  return {
    id: nextId(),
    colorLabel,
    category,
    categoryLabel,
    state: 'free',
    active: true,
    currentMovement: null,
    createdAt: '2026-11-01T12:00:00.000Z',
    updatedAt: '2026-11-01T12:00:00.000Z',
    ...overrides,
    color,
  }
}

/** Um serviço do contrato (seção 5.1), aberto por padrão. */
export function makeMovement(
  overrides: Partial<Movement> & { boxNumber?: string; color?: BoxColor } = {},
): Movement {
  const { boxNumber = '12', color = 'azul', ...rest } = overrides
  const [colorLabel, category, categoryLabel] = COLOR_INFO[color]
  return {
    id: nextId(),
    sheetDate: SERVER_DATE,
    box: { id: nextId(), number: boxNumber, color, colorLabel, category, categoryLabel },
    clientName: 'Ótica Central',
    orderService: '4521',
    note: null,
    status: 'open',
    daysOpen: 0,
    delayLevel: 'neutral',
    createdBy: { id: operatorUser.id, name: operatorUser.name },
    createdAt: '2026-11-23T11:12:00.000Z',
    outBy: null,
    outAt: null,
    outDate: null,
    boxReleasedBy: null,
    boxReleasedAt: null,
    updatedAt: '2026-11-23T11:12:00.000Z',
    canEdit: true,
    canChangeBox: rest.status !== 'out',
    undo: null,
    ...rest,
  }
}

export function summaryReply(counts: Partial<MovementSummary['counts']> = {}) {
  return {
    status: 200,
    data: {
      serverDate: SERVER_DATE,
      counts: { launchedToday: 0, open: 0, pendingFromPreviousDays: 0, attention: 0, late: 0, outNotReleased: 0, ...counts },
    },
  }
}

/** Respostas mínimas para a tela Hoje abrir sem erro. */
export const todayHandlers = {
  'GET /movements/summary': summaryReply(),
  [`GET /sheets/${SERVER_DATE}`]: {
    status: 200,
    data: { sheet: { date: SERVER_DATE, counts: { launched: 0, out: 0, open: 0 } }, items: [], nextCursor: null, serverDate: SERVER_DATE },
  },
}
