import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-ink-inverse hover:bg-primary-hover disabled:bg-primary/60',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted disabled:text-ink-muted',
  ghost: 'text-ink hover:bg-surface-muted disabled:text-ink-muted',
  danger: 'bg-danger text-ink-inverse hover:bg-danger/90 disabled:bg-danger/60',
}

// md: 44 px (mínimo de toque); lg: 56 px (ações principais).
const SIZES: Record<Size, string> = {
  md: 'min-h-touch px-4 text-base',
  lg: 'min-h-touch-lg px-5 text-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Mostra o carregamento e desabilita o botão (evita envio duplicado). */
  loading?: boolean
  loadingText?: string
  icon?: ReactNode
  fullWidth?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children !== undefined && <span>{loading && loadingText ? loadingText : children}</span>}
    </button>
  )
}
