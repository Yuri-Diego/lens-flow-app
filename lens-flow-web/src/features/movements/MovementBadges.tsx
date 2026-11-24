import type { DelayLevel, Movement } from '@/lib/api'
import { cn } from '@/lib/cn'
import { daysOpenLabel } from '@/lib/format'
import { DELAY_LEVELS, STAGES, movementStage } from './movementLabels'

const badgeClass = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold'

export function DelayBadge({ level, className }: { level: DelayLevel; className?: string }) {
  const { label, Icon, className: tone } = DELAY_LEVELS[level]
  return (
    <span className={cn(badgeClass, tone, className)} data-delay={level}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  )
}

/** Situação do serviço: aberto (com atraso) ou saiu (com ou sem a caixa liberada). */
export function MovementStatus({ movement }: { movement: Movement }) {
  const stage = movementStage(movement)
  if (stage === 'open') {
    return (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        {movement.delayLevel && <DelayBadge level={movement.delayLevel} />}
        <span className="text-xs text-ink-muted">{daysOpenLabel(movement.daysOpen)}</span>
      </span>
    )
  }
  const { label, Icon, className } = STAGES[stage]
  return (
    <span className={cn(badgeClass, className)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  )
}
