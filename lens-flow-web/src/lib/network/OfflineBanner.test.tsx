import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { api } from '@/lib/api'
import { mockApi, operatorUser, renderApp, todayHandlers } from '@/test/utils'
import { resetConnectivity } from './connectivity'

describe('Faixa "sem conexão"', () => {
  afterEach(() => resetConnectivity())

  it('aparece quando a API não responde e some depois de "Tentar de novo"', async () => {
    let serverUp = false
    mockApi({
      'GET /auth/me': { status: 200, data: { user: operatorUser } },
      ...todayHandlers,
      'GET /health': () => (serverUp ? { status: 200, data: { status: 'ok' } } : 'network-error'),
    })
    const user = userEvent.setup()
    renderApp('/hoje')
    await screen.findByRole('heading', { name: 'Hoje' })
    // Espera a tela terminar de carregar, para nenhuma resposta atrasada esconder a faixa.
    await screen.findByText('Nenhum serviço lançado hoje')
    expect(screen.queryByText('Sem conexão com o servidor.')).not.toBeInTheDocument()

    await act(() => api.get('/health').catch(() => {}))
    expect(await screen.findByText('Sem conexão com o servidor.')).toBeInTheDocument()

    serverUp = true
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(screen.queryByText('Sem conexão com o servidor.')).not.toBeInTheDocument()
  })

  it('aparece quando o aparelho fica offline', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/hoje')
    await screen.findByRole('heading', { name: 'Hoje' })

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(screen.getByText('Sem internet neste aparelho.')).toBeInTheDocument()

    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(screen.queryByText('Sem internet neste aparelho.')).not.toBeInTheDocument()
  })
})
