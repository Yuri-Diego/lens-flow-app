import {
  api,
  type BatchAction,
  type BatchResult,
  type HistoryEvent,
  type Movement,
  type MovementPage,
  type MovementSort,
  type MovementSummary,
  type MovementWarning,
  type UndoAction,
} from '@/lib/api'

/** Filtros de `GET /api/movements` (contrato 5.3). Valores vazios não vão na consulta. */
export interface MovementListParams {
  status?: 'open' | 'out'
  boxReleased?: boolean
  sort?: MovementSort
  q?: string
  orderService?: string
  color?: string
  category?: string
  box?: string
  from?: string
  to?: string
  outFrom?: string
  outTo?: string
  createdBy?: string
  outBy?: string
  limit?: number
  cursor?: string
}

/**
 * Chaves do TanStack Query. Tudo que é serviço começa com `movements`, para
 * uma mutação invalidar as listas, o resumo e as folhas de uma vez.
 */
export const movementKeys = {
  all: ['movements'] as const,
  summary: () => ['movements', 'summary'] as const,
  lists: () => ['movements', 'list'] as const,
  list: (params: MovementListParams) => ['movements', 'list', params] as const,
  detail: (id: string) => ['movements', 'detail', id] as const,
}

function clean(params: MovementListParams): Record<string, string> {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query[key] = String(value)
  }
  return query
}

export async function fetchSummary(): Promise<MovementSummary> {
  const { data } = await api.get<MovementSummary>('/movements/summary')
  return data
}

export async function fetchMovements(params: MovementListParams, signal?: AbortSignal): Promise<MovementPage> {
  const { data } = await api.get<MovementPage>('/movements', { params: clean(params), signal })
  return data
}

export async function fetchMovement(
  id: string,
): Promise<{ movement: Movement; history: HistoryEvent[]; serverDate: string }> {
  const { data } = await api.get<{ movement: Movement; history: HistoryEvent[]; serverDate: string }>(
    `/movements/${id}`,
  )
  return data
}

export interface NewMovementInput {
  boxId: string
  clientName: string
  orderService?: string
  note?: string
  clientRequestId: string
}

export async function createMovement(
  input: NewMovementInput,
): Promise<{ movement: Movement; warnings: MovementWarning[] }> {
  const { data } = await api.post<{ movement: Movement; warnings?: MovementWarning[] }>('/movements', input)
  return { movement: data.movement, warnings: data.warnings ?? [] }
}

export interface MovementPatch {
  clientName?: string
  orderService?: string | null
  note?: string | null
}

export async function updateMovement(
  id: string,
  patch: MovementPatch,
): Promise<{ movement: Movement; warnings: MovementWarning[] }> {
  const { data } = await api.patch<{ movement: Movement; warnings?: MovementWarning[] }>(`/movements/${id}`, patch)
  return { movement: data.movement, warnings: data.warnings ?? [] }
}

export async function deleteMovement(id: string): Promise<void> {
  await api.delete(`/movements/${id}`)
}

export async function changeBox(id: string, boxId: string): Promise<Movement> {
  const { data } = await api.post<{ movement: Movement }>(`/movements/${id}/change-box`, { boxId })
  return data.movement
}

export async function checkoutMovement(id: string): Promise<Movement> {
  const { data } = await api.post<{ movement: Movement }>(`/movements/${id}/checkout`)
  return data.movement
}

export async function releaseBox(id: string): Promise<Movement> {
  const { data } = await api.post<{ movement: Movement }>(`/movements/${id}/release-box`)
  return data.movement
}

export async function runBatch(ids: string[], action: BatchAction, clientRequestId: string): Promise<BatchResult> {
  const { data } = await api.post<BatchResult>('/movements/batch', { ids, action, clientRequestId })
  return data
}

export async function undoMovement(id: string, action: UndoAction): Promise<Movement> {
  const { data } = await api.post<{ movement: Movement }>(`/movements/${id}/undo`, { action })
  return data.movement
}

export async function undoBatch(batchId: string): Promise<BatchResult> {
  const { data } = await api.post<BatchResult>(`/movements/batch/${batchId}/undo`)
  return data
}

/** Chave de idempotência por tentativa (R13). */
export function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}
