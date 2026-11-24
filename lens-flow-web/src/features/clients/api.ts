import { api } from '@/lib/api'

/** Um nome de cliente (ótica) já usado na empresa (D24). */
export interface ClientSuggestion {
  name: string
  uses: number
  lastUsedAt: string
}

export const clientKeys = {
  suggestions: (q: string) => ['clients', 'suggestions', q] as const,
}

/** A busca só vale com pelo menos 1 caractere; o contrato aceita até 20 itens. */
export const SUGGESTION_LIMIT = 8
/** O nome do cliente tem até 120 caracteres; a busca usa só o começo. */
const MAX_QUERY = 80

/** `GET /api/clients/suggestions`: nomes que começam com `q`, sem acento e sem maiúsculas. */
export async function fetchClientSuggestions(q: string, signal?: AbortSignal): Promise<ClientSuggestion[]> {
  const { data } = await api.get<{ items: ClientSuggestion[] }>('/clients/suggestions', {
    params: { q: q.slice(0, MAX_QUERY), limit: SUGGESTION_LIMIT },
    signal,
  })
  return data.items
}
