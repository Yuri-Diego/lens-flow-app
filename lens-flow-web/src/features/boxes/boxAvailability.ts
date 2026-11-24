import { useQuery } from '@tanstack/react-query'
import type { Box } from '@/lib/api'
import { formatDayMonth } from '@/lib/format'
import { boxKeys, fetchBoxByNumber, validateBoxNumber } from './api'

export type BoxAvailability =
  | { kind: 'free'; box: Box }
  | { kind: 'occupied'; box: Box; reason: string }
  | { kind: 'inactive'; box: Box; reason: string }

/** "Ocupada por Ótica Central, lançado por Ana Souza em 22/11" (D4, R1). */
export function occupiedReason(box: Box): string {
  const current = box.currentMovement
  if (!current) return `A caixa ${box.number} está ocupada.`
  const base = `Ocupada por ${current.clientName}, lançado por ${current.createdBy.name} em ${formatDayMonth(current.sheetDate)}`
  return current.status === 'out' ? `${base}. O serviço já saiu; falta liberar a caixa.` : `${base}.`
}

export function boxAvailability(box: Box): BoxAvailability {
  if (!box.active) return { kind: 'inactive', box, reason: `A caixa ${box.number} está desativada e não recebe serviço.` }
  if (box.state === 'occupied') return { kind: 'occupied', box, reason: occupiedReason(box) }
  return { kind: 'free', box }
}

/**
 * Procura a caixa pelo número exato enquanto a pessoa digita (D4, D18).
 * `staleTime` curto: a ocupação muda o tempo todo.
 */
export function useBoxLookup(number: string) {
  const valid = validateBoxNumber(number) === null
  return useQuery({
    queryKey: boxKeys.byNumber(number),
    queryFn: ({ signal }) => fetchBoxByNumber(number, signal),
    enabled: valid,
    staleTime: 5_000,
  })
}
