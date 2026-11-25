import { Link } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight } from 'lucide-react'
import { daysBetween, formatDayMonth, weekday } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState, LoadMoreButton } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { fetchSheets, sheetKeys } from './api'

/** "Hoje · segunda-feira", "Ontem · domingo" ou só o dia da semana. */
function dayHint(date: string, serverDate: string | undefined): string {
  const diff = serverDate ? daysBetween(date, serverDate) : null
  const prefix = diff === 0 ? 'Hoje · ' : diff === 1 ? 'Ontem · ' : ''
  return `${prefix}${weekday(date)}`
}

/** Folhas (seção 6, item 8): um dia por linha, com os contadores; tocar abre o dia. */
export function SheetsPage() {
  const query = useInfiniteQuery({
    queryKey: sheetKeys.list(),
    queryFn: ({ pageParam }) => fetchSheets(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const sheets = query.data?.pages.flatMap((page) => page.sheets) ?? []
  const serverDate = query.data?.pages[0]?.serverDate

  return (
    <section>
      <PageHeader title="Folhas" description="Um dia por folha, com os contadores." />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : sheets.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nenhuma folha ainda" description="A folha do dia nasce no primeiro lançamento." />
      ) : (
        <>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {sheets.map((sheet) => (
              <li key={sheet.date}>
                <Link to={`/folhas/${sheet.date}`} className="focus-ring flex min-h-touch-lg items-center gap-3 px-4 py-2.5 hover:bg-surface-muted">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
                    <div className="grow basis-[min-content]">
                      <p className="font-semibold tabular-nums text-ink">{formatDayMonth(sheet.date)}</p>
                      <p className="text-sm text-ink-muted">{dayHint(sheet.date, serverDate)}</p>
                    </div>
                    <dl className="flex shrink-0 gap-3 text-center text-xs text-ink-muted">
                      <div>
                        <dt>Lançados</dt>
                        <dd className="text-base font-bold tabular-nums text-ink">{sheet.counts.launched}</dd>
                      </div>
                      <div>
                        <dt>Saíram</dt>
                        <dd className="text-base font-bold tabular-nums text-status-out">{sheet.counts.out}</dd>
                      </div>
                      <div>
                        <dt>Abertos</dt>
                        <dd className="text-base font-bold tabular-nums text-status-open">{sheet.counts.open}</dd>
                      </div>
                    </dl>
                  </div>
                  <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
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
