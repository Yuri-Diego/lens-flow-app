import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { Search, SearchX } from 'lucide-react'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, LoadMoreButton } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { fetchMovements, movementKeys } from './api'
import { MovementList, MovementRow } from './MovementRow'

/** Buscar (seção 6, item 6, R9): um campo só; o resultado já diz onde está o serviço. */
export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const text = params.get('q') ?? ''
  const q = useDebouncedValue(text.trim(), 300)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const query = useInfiniteQuery({
    queryKey: movementKeys.list({ q, sort: 'recent', limit: 30 }),
    queryFn: ({ pageParam, signal }) => fetchMovements({ q, sort: 'recent', limit: 30, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
  })
  const items = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <PageHeader title="Buscar" description="Por cliente, OS ou número da caixa, em todos os dias." />
      <form role="search" onSubmit={(event) => event.preventDefault()} className="mb-4">
        <label className="relative block">
          <span className="sr-only">Cliente, OS ou caixa</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            ref={inputRef}
            type="search"
            value={text}
            onChange={(event) => setParams(event.target.value ? { q: event.target.value } : {}, { replace: true })}
            placeholder="Cliente, OS ou caixa"
            enterKeyHint="search"
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            className="focus-ring min-h-touch-lg w-full rounded-xl border border-line-strong bg-surface pl-11 pr-3 text-lg"
          />
        </label>
        <p className="mt-1.5 text-sm text-ink-muted">Só números: procura a OS e a caixa com esse número.</p>
      </form>

      {!q ? null : query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={SearchX} title="Nada encontrado" description={`Nenhum serviço com “${q}”. Confira e tente de novo.`} />
      ) : (
        <>
          <MovementList label="Resultados">
            {items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} meta="search" />
            ))}
          </MovementList>
          <LoadMoreButton
            hasNextPage={query.hasNextPage}
            isFetchingNextPage={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          />
        </>
      )}
    </section>
  )
}
