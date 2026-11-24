import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { api } from '@/lib/api'
import { adminUser, mockApi, operatorUser, renderApp, unauthenticated } from '@/test/utils'

describe('Rota protegida', () => {
  it('sem sessão, redireciona para o login guardando a rota pedida', async () => {
    mockApi({ 'GET /auth/me': unauthenticated() })
    const { router } = renderApp('/conferencia?cor=azul')

    expect(await screen.findByRole('button', { name: 'Entrar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({
      from: { pathname: '/conferencia', search: '?cor=azul', hash: '' },
    })
  })

  it('depois do login, volta para a rota pedida', async () => {
    mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': { status: 200, data: { user: operatorUser } },
    })
    const user = userEvent.setup()
    const { router } = renderApp('/buscar')

    await user.type(await screen.findByLabelText('Usuário'), 'joao')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123{Enter}')

    expect(await screen.findByRole('heading', { name: 'Buscar' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/buscar')
  })

  it('com sessão, abre a tela pedida', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/hoje')
    expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
  })

  it('sem conexão ao conferir a sessão, mostra o erro com "Tentar de novo"', async () => {
    mockApi({ 'GET /auth/me': 'network-error' })
    renderApp('/hoje')
    expect(await screen.findByText('Não foi possível abrir o Lens Flow')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sessão expirada no meio do uso leva ao login com aviso, mantendo a rota', async () => {
    let sessionAlive = true
    mockApi({
      'GET /auth/me': () =>
        sessionAlive ? { status: 200, data: { user: operatorUser } } : unauthenticated('Sua sessão expirou. Entre de novo.'),
      'GET /health': () => unauthenticated('Sua sessão expirou. Entre de novo.'),
    })
    const { router } = renderApp('/conferencia')
    await screen.findByRole('heading', { name: 'Conferência' })

    // Qualquer chamada logada que volte 401 derruba a sessão.
    sessionAlive = false
    await api.get('/health').catch(() => {})

    expect(await screen.findByText('Sua sessão expirou. Entre de novo.')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({ from: { pathname: '/conferencia', search: '', hash: '' } })
  })
})

describe('Guarda de perfil', () => {
  it('operador não vê a tela de admin', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/usuarios')

    expect(await screen.findByText('Você não tem acesso a esta tela')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Usuários' })).not.toBeInTheDocument()
  })

  it('operador também não acessa Caixas pela rota, mas abre uma caixa só para ver (D21)', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/caixas')

    expect(await screen.findByText('Você não tem acesso a esta tela')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cadastrar caixas' })).not.toBeInTheDocument()
  })

  it('operador não vê "Administração" na barra lateral', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/hoje')
    await screen.findByRole('heading', { name: 'Hoje' })

    expect(screen.queryByText('Administração')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Caixas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument()
  })

  it('admin vê a tela de admin', async () => {
    mockApi({
      'GET /auth/me': { status: 200, data: { user: adminUser } },
      'GET /users': { status: 200, data: { users: [] } },
      'GET /boxes': { status: 200, data: { boxes: [] } },
    })
    renderApp('/usuarios')
    expect(await screen.findByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
  })

  it('o menu "Mais" mostra Caixas e Usuários para o admin', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: adminUser } } })
    renderApp('/mais')
    const more = await screen.findByRole('navigation', { name: 'Mais opções' })

    await waitFor(() => expect(more).toHaveTextContent('Caixas'))
    expect(more).toHaveTextContent('Usuários')
  })

  it('o menu "Mais" só mostra os itens de admin para admin', async () => {
    mockApi({ 'GET /auth/me': { status: 200, data: { user: operatorUser } } })
    renderApp('/mais')
    const more = await screen.findByRole('navigation', { name: 'Mais opções' })

    await waitFor(() => expect(more).toHaveTextContent('Baixas'))
    expect(more).not.toHaveTextContent('Caixas')
    expect(more).not.toHaveTextContent('Usuários')
  })
})
