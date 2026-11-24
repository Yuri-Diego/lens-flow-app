import { useId, type InputHTMLAttributes, type ReactNode, type Ref } from 'react'
import { CircleAlert } from 'lucide-react'
import { cn } from '@/lib/cn'

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  /** Erro junto do campo (por exemplo, de `ApiError.fields`). */
  error?: string
  hint?: string
  /** Conteúdo à direita, dentro do campo (por exemplo, mostrar/ocultar senha). */
  trailing?: ReactNode
  ref?: Ref<HTMLInputElement>
}

/**
 * Campo de texto base. Fonte de 16 px (o iPhone não dá zoom), rótulo visível e
 * erro ligado por `aria-describedby`. Passe `inputMode`, `enterKeyHint`,
 * `autoCapitalize` e `autoComplete` conforme o campo (R2).
 */
export function TextField({ label, error, hint, trailing, id, className, ref, ...props }: TextFieldProps) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'focus-ring min-h-touch w-full rounded-xl border bg-surface px-3 py-2 text-base text-ink placeholder:text-ink-muted',
            error ? 'border-danger' : 'border-line-strong',
            trailing ? 'pr-14' : undefined,
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center">{trailing}</div>}
      </div>
      {hint && (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}
