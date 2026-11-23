import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { adminUser, mockApi, operatorUser, renderApp, unauthenticated } from '@/test/utils'

describe('Layout', () => {
  it('cabeçalho mostra quem está logado, com "Trocar usuário" e "Sair" (D12)', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/hoje')

    const header = await screen.findByRole('banner')
    expect(within(header).getByText('João Lima')).toBeInTheDocument()
    expect(within(header).getByText('Operador')).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Trocar usuário' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })

  it('barra de navegação em pt-BR: Hoje, Conferência, Buscar e Mais', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/hoje')
    await screen.findByRole('heading', { name: 'Hoje' })

    const [, bottomNav] = screen.getAllByRole('navigation', { name: 'Navegação principal' })
    const labels = within(bottomNav).getAllByRole('link').map((link) => link.textContent)
    expect(labels).toEqual(['Hoje', 'Conferência', 'Buscar', 'Mais'])
  })

  it('"Trocar usuário" encerra a sessão, abre o login e depois volta à mesma tela (R16)', async () => {
    let loggedIn: typeof adminUser | typeof operatorUser | null = adminUser
    const { calls } = mockApi({
      'GET /auth/me': () => (loggedIn ? { status: 200, data: { user: loggedIn } } : unauthenticated()),
      'POST /auth/logout': () => {
        loggedIn = null
        return { status: 204 }
      },
      'POST /auth/login': () => {
        loggedIn = operatorUser
        return { status: 200, data: { user: operatorUser } }
      },
    })
    const user = userEvent.setup()
    const { router } = renderApp('/buscar')
    await screen.findByRole('heading', { name: 'Buscar' })

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Trocar usuário' }))

    expect(await screen.findByRole('heading', { name: 'Trocar usuário' })).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'POST' && call.url === '/auth/logout')).toBe(true)

    await user.type(screen.getByLabelText('Usuário'), 'joao')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123{Enter}')

    expect(await screen.findByRole('heading', { name: 'Buscar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/buscar')
    expect(within(screen.getByRole('banner')).getByText('João Lima')).toBeInTheDocument()
  })

  it('"Sair" encerra a sessão e abre o login sem rota de volta', async () => {
    let loggedIn = true
    mockApi({
      'GET /auth/me': () => (loggedIn ? { status: 200, data: { user: operatorUser } } : unauthenticated()),
      'POST /auth/logout': () => {
        loggedIn = false
        return { status: 204 }
      },
    })
    const user = userEvent.setup()
    const { router } = renderApp('/buscar')
    await screen.findByRole('heading', { name: 'Buscar' })

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Sair' }))

    expect(await screen.findByRole('heading', { name: 'Lens Flow' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({})
  })

  it('"Sair" sem conexão avisa e não finge que saiu', async () => {
    mockApi({
      'GET /auth/me': { status: 200, data: { user: operatorUser } },
      'POST /auth/logout': 'network-error',
    })
    const user = userEvent.setup()
    renderApp('/hoje')
    await screen.findByRole('heading', { name: 'Hoje' })

    await user.click(within(screen.getByRole('banner')).getByRole('button', { name: 'Sair' }))

    expect(await screen.findByText(/Não foi possível sair/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
  })
})
