import type { BoxColor } from '@/lib/api'
import { cn } from '@/lib/cn'
import { BOX_CATEGORIES, BOX_COLORS, boxAccessibleLabel } from './boxColors'

type Size = 'sm' | 'md' | 'lg'

const SIZES: Record<Size, { chip: string; swatch: string; number: string; meta: string; icon: string }> = {
  sm: { chip: 'gap-1.5 px-1.5 py-1', swatch: 'size-4 rounded', number: 'text-sm', meta: 'text-xs', icon: 'size-3.5' },
  md: { chip: 'gap-2 px-2 py-1.5', swatch: 'size-6 rounded-md', number: 'text-lg', meta: 'text-xs', icon: 'size-4' },
  lg: { chip: 'gap-3 px-3 py-2', swatch: 'size-9 rounded-lg', number: 'text-2xl', meta: 'text-sm', icon: 'size-4' },
}

export interface BoxChipProps {
  /** Sempre texto, como na etiqueta ("007" ≠ "7", D18). Sem número: só a cor (legenda, filtro). */
  number?: string
  color: BoxColor
  size?: Size
  /** `sm` mostra só número e ícone; o rótulo acessível continua completo. */
  showLabels?: boolean
  className?: string
}

/**
 * A caixa na tela: amostra de cor sobre fundo neutro (com borda, para a branca
 * aparecer), número, ícone e rótulo da categoria. A cor nunca é a única
 * informação (R10).
 */
export function BoxChip({ number, color, size = 'md', showLabels = size !== 'sm', className }: BoxChipProps) {
  const colorInfo = BOX_COLORS[color]
  const category = BOX_CATEGORIES[colorInfo.category]
  const styles = SIZES[size]
  const { Icon } = category

  return (
    <span
      role="img"
      aria-label={boxAccessibleLabel(number, color)}
      className={cn(
        'inline-flex max-w-full items-center rounded-xl border border-line bg-surface text-ink',
        styles.chip,
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-testid="box-swatch"
        className={cn('shrink-0 border border-box-swatch-border/60', styles.swatch, colorInfo.swatchClass)}
      />
      {number !== undefined && (
        <span aria-hidden="true" className={cn('font-mono font-bold tabular-nums', styles.number)}>
          {number}
        </span>
      )}
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-semibold',
          styles.meta,
          category.badgeClass,
        )}
      >
        <Icon className={cn('shrink-0', styles.icon)} />
        {showLabels && (
          <span className="truncate">
            {colorInfo.label} · {category.label}
          </span>
        )}
      </span>
    </span>
  )
}
