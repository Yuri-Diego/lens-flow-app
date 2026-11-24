import { Disc3, Glasses, Sparkles, Zap, type LucideIcon } from 'lucide-react'
import type { BoxCategory, BoxColor } from '@/lib/api'

/**
 * Cores e categorias de caixa (RN-03, RN-04). A ordem é a mesma de
 * `GET /api/meta/box-colors`. O hex fica nos tokens `--color-box-*` do index.css.
 */
export interface BoxColorInfo {
  key: BoxColor
  label: string
  category: BoxCategory
  /** Classe da amostra de cor. */
  swatchClass: string
}

export interface BoxCategoryInfo {
  key: BoxCategory
  label: string
  Icon: LucideIcon
  /** Texto e fundo do selo de categoria (contraste AA). */
  badgeClass: string
}

// Classes escritas por extenso para o Tailwind encontrar.
export const BOX_COLORS: Record<BoxColor, BoxColorInfo> = {
  branca: { key: 'branca', label: 'Branca', category: 'without_assembly', swatchClass: 'bg-box-branca' },
  preta: { key: 'preta', label: 'Preta', category: 'without_assembly', swatchClass: 'bg-box-preta' },
  verde: { key: 'verde', label: 'Verde', category: 'with_assembly', swatchClass: 'bg-box-verde' },
  amarela: { key: 'amarela', label: 'Amarela', category: 'with_assembly', swatchClass: 'bg-box-amarela' },
  vermelha: { key: 'vermelha', label: 'Vermelha', category: 'urgent', swatchClass: 'bg-box-vermelha' },
  azul: { key: 'azul', label: 'Azul', category: 'with_treatment', swatchClass: 'bg-box-azul' },
}

export const BOX_COLOR_ORDER: BoxColor[] = ['branca', 'preta', 'verde', 'amarela', 'vermelha', 'azul']

export const BOX_CATEGORIES: Record<BoxCategory, BoxCategoryInfo> = {
  without_assembly: {
    key: 'without_assembly',
    label: 'Sem montagem',
    Icon: Disc3,
    badgeClass: 'bg-cat-without-assembly-soft text-cat-without-assembly',
  },
  with_assembly: {
    key: 'with_assembly',
    label: 'Com montagem',
    Icon: Glasses,
    badgeClass: 'bg-cat-with-assembly-soft text-cat-with-assembly',
  },
  urgent: {
    key: 'urgent',
    label: 'Urgente',
    Icon: Zap,
    badgeClass: 'bg-cat-urgent-soft text-cat-urgent',
  },
  with_treatment: {
    key: 'with_treatment',
    label: 'Com tratamento',
    Icon: Sparkles,
    badgeClass: 'bg-cat-with-treatment-soft text-cat-with-treatment',
  },
}

/** "Caixa 12, Vermelha, Urgente"; sem número (legenda, filtro), "Vermelha, Urgente". */
export function boxAccessibleLabel(number: string | undefined, color: BoxColor): string {
  const colorInfo = BOX_COLORS[color]
  const category = BOX_CATEGORIES[colorInfo.category]
  const description = `${colorInfo.label}, ${category.label}`
  return number === undefined ? description : `Caixa ${number}, ${description}`
}
