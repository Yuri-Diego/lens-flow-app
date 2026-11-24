import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { mockApi, operatorUser, renderApp } from '@/test/utils'

function setup(reply: Parameters<typeof mockApi>[0][string] = { status: 204 }) {
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: operatorUser } },
    'PATCH /auth/password': reply,
  })
  const user = userEvent.setup()
  renderApp('/conta')
  return { ...api, user }
}

async function fill(user: ReturnType<typeof userEvent.setup>, current: string, next: string, confirm = next) {
  await user.type(await screen.findByLabelText('Senha atual'), current)
  await user.type(screen.getByLabelText('Senha nova'), next)
  await user.type(screen.getByLabelText('Repita a senha nova'), confirm)
  await user.click(screen.getByRole('button', { name: 'Trocar senha' }))
}

describe('Minha conta', () => {
  it('o operador troca a própria senha', async () => {
    const { user, calls } = setup()
    expect(await screen.findByText('Operador', { selector: 'dd' })).toBeInTheDocument()
    await fill(user, 'senha-velha-1', 'senha-nova-123')

    expect(await screen.findByText(/Senha trocada/)).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PATCH')?.data).toEqual({ currentPassword: 'senha-velha-1', newPassword: 'senha-nova-123' })
    expect(screen.getByLabelText('Senha atual')).toHaveValue('')
  })

  it('confere no cliente: tamanho e confirmação', async () => {
    const { user, calls } = setup()
    await fill(user, 'senha-velha-1', 'curta')
    expect(screen.getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Senha nova'))
    await user.type(screen.getByLabelText('Senha nova'), 'senha-nova-123')
    await user.clear(screen.getByLabelText('Repita a senha nova'))
    await user.type(screen.getByLabelText('Repita a senha nova'), 'senha-nova-124')
    await user.click(screen.getByRole('button', { name: 'Trocar senha' }))
    expect(screen.getByText('As duas senhas novas não são iguais.')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'PATCH')).toBe(false)
  })

  it('senha atual errada aparece junto do campo e o que foi digitado fica', async () => {
    const { user } = setup({
      status: 400,
      data: { error: { code: 'VALIDATION_ERROR', message: 'Confira os campos destacados.', fields: { currentPassword: 'Senha atual incorreta.' } } },
    })
    await fill(user, 'errada-123', 'senha-nova-123')

    expect(await screen.findByText('Senha atual incorreta.')).toBeInTheDocument()
    expect(screen.getByLabelText('Senha nova')).toHaveValue('senha-nova-123')
  })
})
