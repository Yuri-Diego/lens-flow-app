import { api, type ApiErrorCode, type Box, type BoxColor } from '@/lib/api'

export const boxKeys = {
  all: ['boxes'] as const,
  byNumber: (number: string) => ['boxes', 'number', number] as const,
  detail: (id: string) => ['boxes', 'detail', id] as const,
  list: () => ['boxes', 'list'] as const,
}

/** Todas as caixas da empresa, ativas e inativas, em ordem natural (contrato 3.7). */
export async function fetchBoxes(signal?: AbortSignal): Promise<Box[]> {
  const { data } = await api.get<{ boxes: Box[] }>('/boxes', { signal })
  return data.boxes
}

export interface BoxBatchItem {
  number: string
  ok: boolean
  box?: Box
  error?: { code: ApiErrorCode | (string & {}); message: string }
}

export interface BoxBatchResult {
  results: BoxBatchItem[]
  summary: { requested: number; created: number; failed: number }
}

/** Cadastro em lote (admin, contrato 3.10): o texto vai como foi digitado. */
export async function createBoxBatch(color: BoxColor, numbers: string): Promise<BoxBatchResult> {
  const { data } = await api.post<BoxBatchResult>('/boxes/batch', { color, numbers })
  return data
}

/** Edita número, cor ou ativo (admin, contrato 3.11). */
export async function updateBox(
  id: string,
  input: Partial<{ number: string; color: BoxColor; active: boolean }>,
): Promise<Box> {
  const { data } = await api.patch<{ box: Box }>(`/boxes/${id}`, input)
  return data.box
}

/** A caixa com exatamente esse número (D4, D18), livre ou ocupada, ou `null`. */
export async function fetchBoxByNumber(number: string, signal?: AbortSignal): Promise<Box | null> {
  const { data } = await api.get<{ boxes: Box[] }>('/boxes', { params: { number }, signal })
  return data.boxes[0] ?? null
}

export async function fetchBox(id: string): Promise<Box> {
  const { data } = await api.get<{ box: Box }>(`/boxes/${id}`)
  return data.box
}

/** Só dígitos, até 6, maior que zero. O texto fica como digitado ("007" ≠ "7"). */
export function validateBoxNumber(value: string): string | null {
  if (!value) return 'Digite o número da caixa.'
  if (!/^\d+$/.test(value)) return 'Use só dígitos no número da caixa.'
  if (value.length > 6) return 'O número da caixa tem no máximo 6 dígitos.'
  if (/^0+$/.test(value)) return 'O número da caixa precisa ser maior que zero.'
  return null
}
