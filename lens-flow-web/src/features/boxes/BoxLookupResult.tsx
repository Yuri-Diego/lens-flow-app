import { Ban, CircleCheck, SearchX } from 'lucide-react'
import type { Box } from '@/lib/api'
import { normalizeApiError } from '@/lib/api'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'
import { BoxChip } from './BoxChip'
import { boxAvailability } from './boxAvailability'

/**
 * O que o número digitado encontrou (R1): a caixa livre já fica escolhida; a
 * ocupada ou desativada aparece desabilitada, com o motivo.
 */
export function BoxLookupResult({
  number,
  box,
  isLoading,
  error,
  onPickFree,
  id,
}: {
  number: string
  box: Box | null | undefined
  isLoading: boolean
  error: unknown
  /** Tocar na caixa livre leva ao próximo campo (R2). */
  onPickFree?: () => void
  id?: string
}) {
  if (!number) return null

  let content
  if (isLoading) {
    content = (
      <p className="flex items-center gap-2 text-sm text-ink-muted">
        <Spinner className="size-4" /> Procurando a caixa {number}…
      </p>
    )
  } else if (error) {
    content = <p className="text-sm font-medium text-danger">{normalizeApiError(error).message}</p>
  } else if (box === null) {
    content = (
      <p className="flex items-start gap-2 text-sm font-medium text-danger">
        <SearchX aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        Não existe caixa {number}. Confira o número na etiqueta.
      </p>
    )
  } else if (box) {
    const availability = boxAvailability(box)
    if (availability.kind === 'free') {
      content = (
        <button
          type="button"
          onClick={onPickFree}
          className="focus-ring flex w-full items-center gap-3 rounded-xl border-2 border-success bg-success-soft p-2 text-left"
        >
          <BoxChip number={box.number} color={box.color} />
          <span className="flex items-center gap-1 text-sm font-semibold text-success">
            <CircleCheck aria-hidden="true" className="size-4" />
            Livre · escolhida
          </span>
        </button>
      )
    } else {
      content = (
        <div
          aria-disabled="true"
          className="flex w-full flex-col gap-2 rounded-xl border border-line bg-surface-muted p-2"
        >
          <div className="flex items-center gap-3 opacity-70 grayscale">
            <BoxChip number={box.number} color={box.color} />
            <span className="flex items-center gap-1 text-sm font-semibold text-ink-muted">
              <Ban aria-hidden="true" className="size-4" />
              {availability.kind === 'occupied' ? 'Ocupada' : 'Desativada'}
            </span>
          </div>
          <p className={cn('text-sm font-medium text-danger')}>{availability.reason}</p>
        </div>
      )
    }
  }

  return (
    <div id={id} aria-live="polite" className="mt-2">
      {content}
    </div>
  )
}
