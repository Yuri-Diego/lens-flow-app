import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import { api } from '@/lib/api'
import { routes } from '@/app/routes'
import { mockApi, operatorUser, renderApp, unauthenticated } from '@/test/utils'
import { useDraft } from './useDraft'

function DraftForm() {
  const [client, setClient] = useDraft('teste', '')
  return (
    <label>
      Cliente
      <input value={client} onChange={(event) => setClient(event.target.value)} />
    </label>
  )
}

// As rotas do app, com uma tela de formulário de teste no lugar de /servicos/novo.
const testRoutes: RouteObject[] = routes.map((route) =>
  route.children
    ? { ...route, children: [{ path: 'servicos/novo', element: <DraftForm /> }, ...route.children] }
    : route,
)

describe('Rascunho (R17)', () => {
  it('o que foi digitado volta depois de a sessão expirar e a pessoa entrar de novo', async () => {
    let alive = true
    mockApi({
      'GET /auth/me': () => (alive ? { status: 200, data: { user: operatorUser } } : unauthenticated()),
      'GET /health': () => unauthenticated('Sua sessão expirou. Entre de novo.'),
      'POST /auth/login': () => {
        alive = true
        return { status: 200, data: { user: operatorUser } }
      },
    })
    const user = userEvent.setup()
    renderApp('/servicos/novo', testRoutes)

    await user.type(await screen.findByLabelText('Cliente'), 'Ótica Central')

    alive = false
    await api.get('/health').catch(() => {})
    await screen.findByText('Sua sessão expirou. Entre de novo.')

    await user.type(screen.getByLabelText('Usuário'), 'joao')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123{Enter}')

    expect(await screen.findByLabelText('Cliente')).toHaveValue('Ótica Central')
  })
})
