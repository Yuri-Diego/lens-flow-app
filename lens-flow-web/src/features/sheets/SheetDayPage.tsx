import { useParams } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { formatFullDate, weekday } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, LoadMoreButton } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { MovementList, MovementRow } from '@/features/movements/MovementRow'
import { fetchSheetDay, sheetKeys } from './api'

/** Uma folha: os contadores e os serviços lançados naquele dia. */
export function SheetDayPage() {
  const { date = '' } = useParams()
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const query = useInfiniteQuery({
    queryKey: sheetKeys.day(date, 'recent'),
    queryFn: ({ pageParam }) => fetchSheetDay(date, pageParam, 'recent'),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: valid,
  })
  const counts = query.data?.pages[0]?.sheet.counts
  const items = query.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <PageHeader
        title={`Folha de ${formatFullDate(date)}`}
        description={
          counts
            ? `${weekday(date)} · ${counts.launched} lançados · ${counts.out} saíram · ${counts.open} abertos`
            : weekday(date)
        }
      />
      {!valid ? (
        <EmptyState title="Data inválida" description="Volte para Folhas e escolha um dia." />
      ) : query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum serviço nesta folha" />
      ) : (
        <>
          <MovementList label="Serviços da folha">
            {items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
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
