import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import type { Movement } from '@/lib/api'
import { formatDayMonth, formatDayTime, formatTime } from '@/lib/format'
import { BoxChip } from '@/features/boxes/BoxChip'
import { MovementStatus } from './MovementBadges'

export type RowMeta = 'created' | 'out' | 'search'

function metaText(movement: Movement, meta: RowMeta): string {
  if (meta === 'out' && movement.outAt) {
    const out = `Baixa por ${movement.outBy?.name ?? '—'} às ${formatTime(movement.outAt)}`
    return movement.boxReleasedAt
      ? `${out} · caixa liberada por ${movement.boxReleasedBy?.name ?? '—'} às ${formatTime(movement.boxReleasedAt)}`
      : out
  }
  if (meta === 'search') {
    const where =
      movement.status === 'out' && movement.outDate ? `saiu em ${formatDayMonth(movement.outDate)}` : `folha de ${formatDayMonth(movement.sheetDate)}`
    return `Lançado por ${movement.createdBy.name} em ${formatDayTime(movement.createdAt)} · ${where}`
  }
  return `Lançado por ${movement.createdBy.name} às ${formatTime(movement.createdAt)}`
}

/**
 * Linha de serviço que leva ao detalhe: caixa, cliente, OS, situação e quem fez.
 * No celular o `trailing` desce para a linha de baixo, para não espremer o serviço.
 */
export function MovementRow({ movement, meta = 'created', trailing }: { movement: Movement; meta?: RowMeta; trailing?: ReactNode }) {
  return (
    <li className="flex flex-wrap items-stretch">
      <Link
        to={`/servicos/${movement.id}`}
        className="focus-ring flex min-h-touch-lg min-w-0 flex-1 basis-72 items-center gap-3 px-3 py-2.5 hover:bg-surface-muted"
      >
        <BoxChip number={movement.box.number} color={movement.box.color} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink">{movement.clientName}</p>
          <p className="truncate text-sm text-ink-muted">
            {movement.orderService ? `OS ${movement.orderService}` : 'Sem OS'}
            {movement.note ? ` · ${movement.note}` : ''}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <MovementStatus movement={movement} />
          </div>
          <p className="mt-0.5 text-xs text-ink-muted wrap-anywhere">{metaText(movement, meta)}</p>
        </div>
        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
      </Link>
      {trailing}
    </li>
  )
}

export function MovementList({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ul aria-label={label} className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
      {children}
    </ul>
  )
}
