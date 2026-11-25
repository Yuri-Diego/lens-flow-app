import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider, useEndToastSession, useToast, type ToastOptions } from './Toast'

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

  it('com `id`, fecha só o aviso daquele assunto', () => {
    function TwoToasts() {
      const toast = useToast()
      return (
        <>
          <button onClick={() => ['a', 'b'].forEach((id) => toast.show({ id, message: `Aviso ${id}`, duration: null }))}>
            Mostrar
          </button>
          <button onClick={() => toast.dismiss('a')}>Resolver a</button>
        </>
      )
    }
    render(
      <ToastProvider>
        <TwoToasts />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }))
    expect(screen.getAllByText('Aviso a')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Resolver a' }))
    expect(screen.queryByText('Aviso a')).not.toBeInTheDocument()
    expect(screen.getByText('Aviso b')).toBeInTheDocument()
  })

  it('no fim da sessão, fecha todos e ignora o que a tela da sessão encerrada ainda mostraria (D12)', () => {
    function Screen({ name }: { name: string }) {
      const toast = useToast()
      return <button onClick={() => toast.show({ message: `Aviso de ${name}`, duration: null })}>Mostrar {name}</button>
    }
    function EndSession() {
      return <button onClick={useEndToastSession()}>Encerrar</button>
    }
    const view = (next: boolean) => (
      <ToastProvider>
        <EndSession />
        <Screen name="Ana" />
        {next && <Screen name="João" />}
      </ToastProvider>
    )
    const { rerender } = render(view(false))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar Ana' }))
    expect(screen.getByText('Aviso de Ana')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Encerrar' }))
    expect(screen.queryByText('Aviso de Ana')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar Ana' }))
    expect(screen.queryByText('Aviso de Ana')).not.toBeInTheDocument()

    rerender(view(true))
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar João' }))
    expect(screen.getByText('Aviso de João')).toBeInTheDocument()
  })

  it('erro é anunciado como alerta', () => {
    renderTrigger({ message: 'Não foi possível salvar.', tone: 'error' })
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar.')
  })
})
