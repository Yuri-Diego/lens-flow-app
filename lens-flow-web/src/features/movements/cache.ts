import type { InfiniteData, QueryClient } from '@tanstack/react-query'
import type { Movement, MovementPage, SessionUser } from '@/lib/api'
import { movementKeys } from './api'

type ListData = InfiniteData<MovementPage> | MovementPage

function mapItems(data: ListData | undefined, map: (item: Movement) => Movement): ListData | undefined {
  if (!data) return data
  if ('pages' in data) {
    return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.map(map) })) }
  }
  if ('items' in data) return { ...data, items: data.items.map(map) }
  return data
}

/** Troca os serviços (pelo id) em todas as listas em cache e no detalhe. */
export function replaceMovements(queryClient: QueryClient, movements: Movement[]): void {
  if (movements.length === 0) return
  const byId = new Map(movements.map((movement) => [movement.id, movement]))
  queryClient.setQueriesData<ListData>({ queryKey: movementKeys.lists() }, (data) =>
    mapItems(data, (item) => byId.get(item.id) ?? item),
  )
  for (const movement of movements) {
    queryClient.setQueryData<{ movement: Movement }>(movementKeys.detail(movement.id), (data) =>
      data ? { ...data, movement } : data,
    )
  }
}

/** Os serviços como estão agora nas listas em cache (para desfazer o otimista). */
export function snapshotMovements(queryClient: QueryClient, ids: string[]): Movement[] {
  const wanted = new Set(ids)
  const found = new Map<string, Movement>()
  for (const [, data] of queryClient.getQueriesData<ListData>({ queryKey: movementKeys.lists() })) {
    mapItems(data, (item) => {
      if (wanted.has(item.id) && !found.has(item.id)) found.set(item.id, item)
      return item
    })
  }
  return [...found.values()]
}

export type OptimisticAction = 'checkout' | 'release-box' | 'checkout-and-release'

/** O serviço como ele deve ficar depois da ação, antes de o servidor responder (T2). */
export function optimisticMovement(movement: Movement, action: OptimisticAction, user: SessionUser | null): Movement {
  const now = new Date().toISOString()
  const me = user ? { id: user.id, name: user.name } : null
  const out: Movement =
    movement.status === 'open' && action !== 'release-box'
      ? { ...movement, status: 'out', outAt: now, outBy: me, daysOpen: null, delayLevel: null, canChangeBox: false }
      : movement
  if (action === 'checkout') return out
  return { ...out, boxReleasedAt: now, boxReleasedBy: me }
}

/** Depois de uma mutação: contadores na hora; listas marcadas para recarregar sem pular na tela. */
export function afterMovementChange(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: movementKeys.summary() })
  void queryClient.invalidateQueries({ queryKey: movementKeys.all, refetchType: 'none' })
  void queryClient.invalidateQueries({ queryKey: ['boxes'], refetchType: 'none' })
}
