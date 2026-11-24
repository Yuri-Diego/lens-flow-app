import { api, type Box } from '@/lib/api'

export const boxKeys = {
  all: ['boxes'] as const,
  byNumber: (number: string) => ['boxes', 'number', number] as const,
  detail: (id: string) => ['boxes', 'detail', id] as const,
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
