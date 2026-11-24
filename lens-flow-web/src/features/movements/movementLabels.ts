import { CircleCheck, Clock, Hourglass, PackageCheck, Siren, TriangleAlert, type LucideIcon } from 'lucide-react'
import type { DelayLevel, Movement } from '@/lib/api'

/** Nível de atraso (D15): sempre texto e ícone, nunca só a cor (R4). */
export const DELAY_LEVELS: Record<DelayLevel, { label: string; Icon: LucideIcon; className: string }> = {
  neutral: { label: 'Em dia', Icon: Clock, className: 'bg-delay-neutral-soft text-delay-neutral' },
  normal: { label: 'Normal', Icon: Hourglass, className: 'bg-delay-normal-soft text-delay-normal' },
  attention: { label: 'Atenção', Icon: TriangleAlert, className: 'bg-delay-attention-soft text-delay-attention' },
  late: { label: 'Atrasado', Icon: Siren, className: 'bg-delay-late-soft text-delay-late' },
}

export type MovementStage = 'open' | 'out' | 'released'

/** Pendente → saiu (caixa ainda ocupada) → saiu e caixa liberada (D6). */
export function movementStage(movement: Pick<Movement, 'status' | 'boxReleasedAt'>): MovementStage {
  if (movement.status === 'open') return 'open'
  return movement.boxReleasedAt ? 'released' : 'out'
}

export const STAGES: Record<MovementStage, { label: string; Icon: LucideIcon; className: string }> = {
  open: { label: 'Pendente', Icon: Hourglass, className: 'bg-status-open-soft text-status-open' },
  out: { label: 'Saiu · falta liberar a caixa', Icon: PackageCheck, className: 'bg-status-out-soft text-status-out' },
  released: { label: 'Saiu · caixa liberada', Icon: CircleCheck, className: 'bg-status-out-soft text-status-out' },
}
