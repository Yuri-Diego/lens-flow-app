import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { BoxColor } from '@/lib/api'
import { BoxChip } from './BoxChip'

const CASES: Array<[BoxColor, string, string]> = [
  ['branca', 'Branca', 'Sem montagem'],
  ['preta', 'Preta', 'Sem montagem'],
  ['verde', 'Verde', 'Com montagem'],
  ['amarela', 'Amarela', 'Com montagem'],
  ['vermelha', 'Vermelha', 'Urgente'],
  ['azul', 'Azul', 'Com tratamento'],
]

describe('BoxChip', () => {
  it.each(CASES)('caixa %s: o rótulo acessível tem número, cor e categoria', (color, colorLabel, categoryLabel) => {
    render(<BoxChip number="12" color={color} />)

    const chip = screen.getByRole('img', { name: `Caixa 12, ${colorLabel}, ${categoryLabel}` })
    expect(chip).toBeInTheDocument()
    // A cor não é a única informação: nome da cor e categoria também aparecem em texto.
    expect(chip).toHaveTextContent(`${colorLabel} · ${categoryLabel}`)
  })

  it('mostra o número como texto, com o zero à esquerda (D18)', () => {
    render(<BoxChip number="007" color="azul" />)
    expect(screen.getByRole('img', { name: 'Caixa 007, Azul, Com tratamento' })).toHaveTextContent('007')
  })

  it('no tamanho pequeno esconde os textos, mas o rótulo acessível continua completo', () => {
    render(<BoxChip number="3" color="vermelha" size="sm" />)
    const chip = screen.getByRole('img', { name: 'Caixa 3, Vermelha, Urgente' })
    expect(chip).not.toHaveTextContent('Urgente')
    expect(chip.querySelector('svg')).not.toBeNull()
  })

  it('sem número (legenda ou filtro), o rótulo traz só cor e categoria', () => {
    render(<BoxChip color="verde" />)
    expect(screen.getByRole('img', { name: 'Verde, Com montagem' })).toBeInTheDocument()
  })

  it('a amostra da caixa branca tem borda para aparecer no fundo claro', () => {
    render(<BoxChip number="1" color="branca" />)
    const swatch = screen.getByTestId('box-swatch')
    expect(swatch).toHaveClass('bg-box-branca')
    expect(swatch.className).toMatch(/\bborder\b/)
  })
})
