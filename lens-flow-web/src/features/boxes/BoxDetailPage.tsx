import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus } from 'lucide-react'
import { normalizeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { formatDayMonth, formatTime } from '@/lib/format'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { boxKeys, fetchBox } from './api'
import { BoxChip } from './BoxChip'

/**
 * A caixa (D21, R19): qualquer pessoa logada vê cor, categoria, estado e o
 * serviço atual. Editar e desativar ficam na tela Caixas, só do admin.
 */
export function BoxDetailPage() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const query = useQuery({ queryKey: boxKeys.detail(id), queryFn: () => fetchBox(id) })

  if (query.isPending) {
    return (
      <section>
        <PageHeader title="Caixa" />
        <ListSkeleton rows={1} />
      </section>
    )
  }
  if (query.isError) {
    return (
      <section>
        <PageHeader title="Caixa" />
        {normalizeApiError(query.error).code === 'NOT_FOUND' ? (
          <EmptyState title="Caixa não encontrada" description="Confira o link ou o número da etiqueta." />
        ) : (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </section>
    )
  }

  const box = query.data
  const current = box.currentMovement
  const state = !box.active ? 'Desativada' : box.state === 'free' ? 'Livre' : current?.status === 'out' ? 'Ocupada · o serviço já saiu, falta liberar' : 'Ocupada'

  return (
    <section>
      <PageHeader title={`Caixa ${box.number}`} description={`${box.colorLabel} · ${box.categoryLabel}`} />
      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <BoxChip number={box.number} color={box.color} size="lg" className="self-start" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          <dt className="text-ink-muted">Estado</dt>
          <dd className="font-semibold" data-testid="box-state">
            {state}
          </dd>
        </dl>

        {current ? (
          <Link to={`/servicos/${current.id}`} className="focus-ring flex min-h-touch-lg items-center gap-3 rounded-xl border border-line p-3 hover:bg-surface-muted">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink-muted">Serviço atual</p>
              <p className="truncate font-semibold text-ink">{current.clientName}</p>
              <p className="text-sm text-ink-muted">
                {current.orderService ? `OS ${current.orderService} · ` : ''}lançado por {current.createdBy.name} em{' '}
                {formatDayMonth(current.sheetDate)} às {formatTime(current.createdAt)}
              </p>
            </div>
            <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
          </Link>
        ) : (
          box.active && (
            <Link
              to={`/servicos/novo?caixa=${encodeURIComponent(box.number)}`}
              className="focus-ring inline-flex min-h-touch-lg items-center justify-center gap-2 rounded-xl bg-primary px-5 text-lg font-semibold text-ink-inverse hover:bg-primary-hover"
            >
              <Plus aria-hidden="true" className="size-5" />
              Novo serviço nesta caixa
            </Link>
          )
        )}
        {user?.role === 'admin' && (
          <p className="text-sm text-ink-muted">
            Para editar ou desativar, use a tela{' '}
            <Link to="/caixas" className="font-semibold text-primary underline-offset-4 hover:underline">
              Caixas
            </Link>
            .
          </p>
        )}
      </div>
    </section>
  )
}
