import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { PackageCheck } from 'lucide-react'
import { api, type Movement, type UserRef } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { formatDayMonth, relativeDayLabel } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, LoadMoreButton } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { fetchMovements, movementKeys, type MovementListParams } from './api'
import { MovementList, MovementRow } from './MovementRow'
import { UndoButton } from './UndoButton'
import { useMovementActions } from './useMovementActions'

function groupByOutDate(items: Movement[]): Array<{ date: string; items: Movement[] }> {
  const groups: Array<{ date: string; items: Movement[] }> = []
  for (const item of items) {
    const date = item.outDate ?? item.sheetDate
    const last = groups[groups.length - 1]
    if (last && last.date === date) last.items.push(item)
    else groups.push({ date, items: [item] })
  }
  return groups
}

const fieldClass = 'focus-ring min-h-touch w-full rounded-xl border border-line-strong bg-surface px-2 text-base'

/** Baixas (seção 6, item 5): por dia, com quem deu baixa e quando; filtro por período e usuário. */
export function CheckoutsPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const outFrom = params.get('de') ?? ''
  const outTo = params.get('ate') ?? ''
  const outBy = params.get('por') ?? ''
  const { undoOne } = useMovementActions()

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const listParams: MovementListParams = { status: 'out', sort: 'recent', outFrom, outTo, outBy, limit: 50 }
  const periodError = outFrom && outTo && outTo < outFrom ? 'O fim do período vem antes do início.' : null

  const query = useInfiniteQuery({
    queryKey: movementKeys.list(listParams),
    queryFn: ({ pageParam, signal }) => fetchMovements({ ...listParams, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled: !periodError,
  })

  // O admin escolhe entre todos os usuários; o operador, entre quem já apareceu na lista.
  const users = useQuery({
    queryKey: ['users', 'list'],
    queryFn: async () => (await api.get<{ users: UserRef[] }>('/users')).data.users,
    enabled: user?.role === 'admin',
    staleTime: 5 * 60_000,
  })

  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  const serverDate = query.data?.pages[0]?.serverDate

  const options = useMemo(() => {
    const map = new Map<string, string>()
    if (user) map.set(user.id, user.name)
    for (const item of items) if (item.outBy) map.set(item.outBy.id, item.outBy.name)
    for (const item of users.data ?? []) map.set(item.id, item.name)
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
  }, [items, user, users.data])

  const groups = groupByOutDate(items)

  return (
    <section>
      <PageHeader title="Baixas" description="Serviços que saíram, por dia, com quem deu baixa e quando." />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          De
          <input type="date" value={outFrom} max={outTo || serverDate} onChange={(e) => setParam('de', e.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          Até
          <input type="date" value={outTo} min={outFrom || undefined} max={serverDate} onChange={(e) => setParam('ate', e.target.value)} className={fieldClass} />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-sm font-semibold md:col-span-1">
          Quem deu baixa
          <select value={outBy} onChange={(e) => setParam('por', e.target.value)} className={fieldClass}>
            <option value="">Todos</option>
            {options.map(([id, name]) => (
              <option key={id} value={id}>
                {id === user?.id ? `${name} (eu)` : name}
              </option>
            ))}
          </select>
        </label>
        {periodError && <p className="col-span-2 text-sm font-medium text-danger">{periodError}</p>}
      </div>

      {periodError ? null : query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={PackageCheck} title="Nenhuma baixa" description="Nada saiu com esses filtros." />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.date} aria-label={`Baixas de ${formatDayMonth(group.date)}`}>
              <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold text-ink">
                {relativeDayLabel(group.date, serverDate)} · {formatDayMonth(group.date)}
              </h2>
              <MovementList>
                {group.items.map((movement) => (
                  <MovementRow
                    key={movement.id}
                    movement={movement}
                    meta="out"
                    trailing={
                      movement.undo ? (
                        <div className="flex items-center pr-2">
                          <UndoButton movement={movement} onUndo={() => void undoOne(movement, movement.undo!.action)} />
                        </div>
                      ) : undefined
                    }
                  />
                ))}
              </MovementList>
            </section>
          ))}
          <LoadMoreButton
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          />
        </div>
      )}
    </section>
  )
}
