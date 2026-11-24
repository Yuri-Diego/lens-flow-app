import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { ClipboardList, PackageOpen, Plus, Siren, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatDayMonth, plural, weekday } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { useToastBottomOffset } from '@/components/ui/Toast'
import { ErrorState, LoadMoreButton } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { fetchSummary, movementKeys } from '@/features/movements/api'
import { MovementList, MovementRow } from '@/features/movements/MovementRow'
import { fetchSheetDay, sheetKeys } from './api'

function Counter({
  label,
  value,
  to,
  Icon,
  tone = 'neutral',
}: {
  label: string
  value: number | undefined
  to?: string
  Icon: LucideIcon
  tone?: 'neutral' | 'attention' | 'late'
}) {
  const body: ReactNode = (
    <>
      <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
        <Icon
          aria-hidden="true"
          className={cn('size-4', tone === 'late' && 'text-delay-late', tone === 'attention' && 'text-delay-attention')}
        />
        {label}
      </span>
      <span className={cn('text-3xl font-bold tabular-nums', tone === 'late' && value ? 'text-delay-late' : 'text-ink')}>
        {value ?? '–'}
      </span>
    </>
  )
  const className = 'flex min-h-touch-lg flex-col justify-between gap-1 rounded-2xl border border-line bg-surface p-3'
  return to ? (
    <Link to={to} className={cn('focus-ring hover:bg-surface-muted', className)}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/** Hoje (seção 6, item 2): data, contadores, a lista do dia e "Novo serviço" ao alcance do polegar. */
export function TodayPage() {
  useToastBottomOffset(72)
  const summary = useQuery({ queryKey: movementKeys.summary(), queryFn: fetchSummary })
  const serverDate = summary.data?.serverDate
  const counts = summary.data?.counts

  const day = useInfiniteQuery({
    queryKey: sheetKeys.day(serverDate ?? '', 'recent'),
    queryFn: ({ pageParam }) => fetchSheetDay(serverDate as string, pageParam, 'recent'),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(serverDate),
  })
  const items = day.data?.pages.flatMap((page) => page.items) ?? []

  return (
    <section>
      <PageHeader
        title="Hoje"
        description={serverDate ? `${weekday(serverDate)}, ${formatDayMonth(serverDate)}` : undefined}
      />

      {summary.isError && <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Counter label="Lançados hoje" value={counts?.launchedToday} Icon={ClipboardList} />
        <Counter
          label="De dias anteriores"
          value={counts?.pendingFromPreviousDays}
          Icon={PackageOpen}
          to="/conferencia"
        />
        <Counter label="Atenção" value={counts?.attention} Icon={TriangleAlert} tone="attention" to="/conferencia?nivel=attention" />
        <Counter label="Atrasados" value={counts?.late} Icon={Siren} tone="late" to="/conferencia?nivel=late" />
      </div>
      {counts && counts.outNotReleased > 0 && (
        <p className="mb-4 text-sm text-ink-muted">
          <Link to="/conferencia?aba=liberar" className="focus-ring font-semibold text-primary underline-offset-4 hover:underline">
            {plural(counts.outNotReleased, 'serviço saiu', 'serviços saíram')} e falta liberar a caixa
          </Link>
        </p>
      )}

      <h2 className="mb-2 text-lg font-bold text-ink">
        Lançados hoje{day.data ? ` (${day.data.pages[0].sheet.counts.launched})` : ''}
      </h2>
      {day.isPending && (summary.isPending || serverDate) ? (
        <ListSkeleton />
      ) : day.isError ? (
        <ErrorState error={day.error} onRetry={() => void day.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nenhum serviço lançado hoje" description="Toque em “Novo serviço” para lançar o primeiro." />
      ) : (
        <>
          <MovementList label="Serviços de hoje">
            {items.map((movement) => (
              <MovementRow key={movement.id} movement={movement} />
            ))}
          </MovementList>
          <LoadMoreButton
            hasNextPage={day.hasNextPage}
            isFetchingNextPage={day.isFetchingNextPage}
            onClick={() => void day.fetchNextPage()}
          />
        </>
      )}

      {/* Ao alcance do polegar: fixo acima da barra de navegação (R8, seção 6 da pesquisa). */}
      <div className="h-20 md:hidden" aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-20 px-4 pb-3 md:static md:mt-4 md:px-0 md:pb-0">
        <Link
          to="/servicos/novo"
          className="focus-ring mx-auto flex min-h-touch-lg w-full max-w-lg items-center justify-center gap-2 rounded-xl bg-primary px-5 text-lg font-semibold text-ink-inverse shadow-lg hover:bg-primary-hover md:mx-0 md:w-auto md:shadow-none"
        >
          <Plus aria-hidden="true" className="size-5" />
          Novo serviço
        </Link>
      </div>
    </section>
  )
}
