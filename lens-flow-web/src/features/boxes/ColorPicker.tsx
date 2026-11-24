import { useRef, type KeyboardEvent } from 'react'
import { Check } from 'lucide-react'
import type { BoxColor } from '@/lib/api'
import { cn } from '@/lib/cn'
import { BoxChip } from './BoxChip'
import { BOX_COLOR_ORDER } from './boxColors'

/**
 * Escolha da cor da caixa (RN-03). A categoria vem junto e nunca é escolhida à
 * mão (RN-04). Grupo de opções acessível: setas trocam a cor, como num rádio.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  error,
  autoFocus = false,
}: {
  label: string
  value: BoxColor | null
  onChange: (color: BoxColor) => void
  error?: string
  autoFocus?: boolean
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = value ? BOX_COLOR_ORDER.indexOf(value) : -1

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = (index + step + BOX_COLOR_ORDER.length) % BOX_COLOR_ORDER.length
    onChange(BOX_COLOR_ORDER[next])
    refs.current[next]?.focus()
  }

  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-semibold text-ink">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-1 min-[440px]:grid-cols-2 sm:grid-cols-3">
        {BOX_COLOR_ORDER.map((color, index) => {
          const checked = value === color
          return (
            <button
              key={color}
              ref={(element) => {
                refs.current[index] = element
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              // Um só ponto de parada no Tab: a cor escolhida, ou a primeira.
              tabIndex={checked || (current === -1 && index === 0) ? 0 : -1}
              data-autofocus={autoFocus && (checked || (current === -1 && index === 0)) ? true : undefined}
              onClick={() => onChange(color)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={cn(
                'focus-ring relative flex min-h-touch items-center rounded-xl border-2 p-1 text-left',
                checked ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-muted',
              )}
            >
              <BoxChip color={color} size="sm" showLabels className="pointer-events-none" />
              {checked && <Check aria-hidden="true" className="absolute right-1.5 top-1.5 size-4 text-primary" />}
            </button>
          )
        })}
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  )
}
