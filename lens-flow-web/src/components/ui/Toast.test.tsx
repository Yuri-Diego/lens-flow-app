import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useToast, type ToastOptions } from './Toast'

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast()
  return <button onClick={() => toast.show(options)}>Mostrar</button>
}

function renderTrigger(options: ToastOptions) {
  render(
    <ToastProvider>
      <Trigger options={options} />
    </ToastProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
}

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('"Desfazer" chama a ação e fecha o aviso', () => {
    const undo = vi.fn()
    renderTrigger({ message: 'Baixa dada na caixa 12.', action: { label: 'Desfazer', onClick: undo } })

    expect(screen.getByRole('status')).toHaveTextContent('Baixa dada na caixa 12.')
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))

    expect(undo).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Baixa dada na caixa 12.')).not.toBeInTheDocument()
  })

  it('com ação, fica pelo menos 10 s na tela (R7)', () => {
    vi.useFakeTimers()
    renderTrigger({ message: 'Lançado.', action: { label: 'Desfazer', onClick: () => {} } })

    act(() => vi.advanceTimersByTime(9_000))
    expect(screen.getByText('Lançado.')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1_500))
    expect(screen.queryByText('Lançado.')).not.toBeInTheDocument()
  })

  it('não some enquanto o foco está nele', () => {
    vi.useFakeTimers()
    renderTrigger({ message: 'Lançado.', action: { label: 'Desfazer', onClick: () => {} } })

    fireEvent.focus(screen.getByRole('button', { name: 'Desfazer' }))
    act(() => vi.advanceTimersByTime(30_000))
    expect(screen.getByText('Lançado.')).toBeInTheDocument()
  })

  it('pode ser fechado na hora', () => {
    renderTrigger({ message: 'Salvo.' })
    fireEvent.click(screen.getByRole('button', { name: 'Fechar aviso' }))
    expect(screen.queryByText('Salvo.')).not.toBeInTheDocument()
  })

  it('erro é anunciado como alerta', () => {
    renderTrigger({ message: 'Não foi possível salvar.', tone: 'error' })
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar.')
  })
})
