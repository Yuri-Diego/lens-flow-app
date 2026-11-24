import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, operatorUser, renderApp } from '@/test/utils'

describe('Baixas', () => {
  it('"Quem deu baixa" lista todos os usuários da empresa para o operador, também os inativos', async () => {
    const { calls } = mockApi({
      'GET /auth/me': { status: 200, data: { user: operatorUser } },
      'GET /movements': { status: 200, data: { items: [], nextCursor: null, serverDate: '2026-11-23' } },
      'GET /users/options': {
        status: 200,
        data: {
          items: [
            { id: 'u-ana', name: 'Ana Souza', active: true },
            { id: operatorUser.id, name: operatorUser.name, active: true },
            { id: 'u-pedro', name: 'Pedro Antigo', active: false },
          ],
        },
      },
    })
    const user = userEvent.setup()
    renderApp('/baixas')

    const select = await screen.findByLabelText('Quem deu baixa')
    await waitFor(() =>
      expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
        'Todos',
        'Ana Souza',
        'João Lima (eu)',
        'Pedro Antigo (inativo)',
      ]),
    )
    // O operador não chama a rota de admin.
    expect(calls.some((call) => call.url === '/users')).toBe(false)

    await user.selectOptions(select, 'Pedro Antigo (inativo)')
    await waitFor(() =>
      expect(calls.some((call) => call.url === '/movements')).toBe(true),
    )
    expect(select).toHaveValue('u-pedro')
  })
})
