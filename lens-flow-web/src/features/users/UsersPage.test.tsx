import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { User } from '@/lib/api'
import { adminUser, mockApi, renderApp } from '@/test/utils'

function makeUser(overrides: Partial<User> & Pick<User, 'id' | 'name' | 'username'>): User {
  return {
    role: 'operator',
    active: true,
    locked: false,
    lockedUntil: null,
    lastLoginAt: null,
    createdAt: '2026-11-22T18:00:00.000Z',
    updatedAt: '2026-11-22T18:00:00.000Z',
    ...overrides,
  }
}

const me = makeUser({ id: adminUser.id, name: adminUser.name, username: adminUser.username, role: 'admin' })
const joao = makeUser({ id: '6741a0c2f1d3a8b9c0e1f2aa', name: 'João Lima', username: 'joao', locked: true, lockedUntil: '2026-11-23T14:15:00.000Z' })
const old = makeUser({ id: '6741a0c2f1d3a8b9c0e1f2ab', name: 'Pedro Antigo', username: 'pedro', active: false })

function setup(handlers: Record<string, unknown> = {}, users: User[] = [me, joao, old]) {
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: adminUser } },
    'GET /users': { status: 200, data: { users } },
    ...(handlers as object),
  })
  const user = userEvent.setup()
  return { ...api, user, ...renderApp('/usuarios') }
}

describe('Usuários (admin)', () => {
  it('lista com perfil, desativado e bloqueado em texto', async () => {
    setup()
    const list = await screen.findByRole('list', { name: 'Usuários' })
    const rows = within(list).getAllByRole('button')
    expect(rows[0]).toHaveTextContent('Ana Souza(você)')
    expect(rows[0]).toHaveTextContent('Administrador')
    expect(rows[1]).toHaveTextContent('Operador')
    expect(rows[1]).toHaveTextContent(/Bloqueado até \d\d:\d\d/)
    expect(rows[2]).toHaveTextContent('Desativado')
  })

  it('formulário de novo usuário: valida no cliente antes de enviar', async () => {
    const { user, calls } = setup()
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })

    await user.type(within(dialog).getByLabelText('Usuário'), 'Jo')
    await user.type(within(dialog).getByLabelText('Senha temporária'), 'curta')
    await user.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

    expect(within(dialog).getByText('Digite o nome.')).toBeInTheDocument()
    expect(within(dialog).getByText('O usuário precisa ter pelo menos 3 caracteres.')).toBeInTheDocument()
    expect(within(dialog).getByText('A senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument()
    // O usuário fica em minúsculas, como o servidor guarda.
    expect(within(dialog).getByLabelText('Usuário')).toHaveValue('jo')
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('cria com nome, usuário, senha temporária e perfil; usuário repetido volta junto do campo', async () => {
    let attempt = 0
    const { user, calls } = setup({
      'POST /users': () => {
        attempt += 1
        return attempt === 1
          ? { status: 409, data: { error: { code: 'CONFLICT', message: 'Esse usuário já existe.', fields: { username: 'Esse usuário já existe. Escolha outro.' } } } }
          : { status: 201, data: { user: makeUser({ id: '6741a0c2f1d3a8b9c0e1f2ac', name: 'Maria Lopes', username: 'maria2', role: 'admin' }) } }
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    const dialog = screen.getByRole('dialog', { name: 'Novo usuário' })
    await user.type(within(dialog).getByLabelText('Nome'), 'Maria Lopes')
    await user.type(within(dialog).getByLabelText('Usuário'), 'maria')
    await user.click(within(dialog).getByRole('button', { name: 'Gerar senha' }))
    expect((within(dialog).getByLabelText('Senha temporária') as HTMLInputElement).value).toMatch(/^[a-z2-9]{10}$/)
    await user.click(within(dialog).getByRole('radio', { name: /Administrador/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

    expect(await within(dialog).findByText('Esse usuário já existe. Escolha outro.')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Nome')).toHaveValue('Maria Lopes')

    await user.type(within(dialog).getByLabelText('Usuário'), '2')
    await user.click(within(dialog).getByRole('button', { name: 'Criar usuário' }))

    expect(await screen.findByText(/Maria Lopes pode entrar com o usuário "maria2"/)).toBeInTheDocument()
    const posts = calls.filter((call) => call.method === 'POST')
    expect(posts[1].data).toMatchObject({ name: 'Maria Lopes', username: 'maria2', role: 'admin' })
    expect((posts[1].data as { password: string }).password).toHaveLength(10)
  })

  it('RN-13: ninguém desativa a si mesmo, e o último admin não perde o perfil', async () => {
    const { user } = setup()
    await user.click(await screen.findByRole('button', { name: /Ana Souza/ }))
    const dialog = screen.getByRole('dialog', { name: 'Ana Souza' })

    expect(within(dialog).getByRole('button', { name: 'Desativar usuário' })).toBeDisabled()
    expect(within(dialog).getByText('Você não pode desativar o seu próprio usuário.')).toBeInTheDocument()
    expect(within(dialog).getByRole('radio', { name: /Operador/ })).toBeDisabled()
    expect(within(dialog).getAllByText(/É o único administrador ativo/).length).toBeGreaterThan(0)
  })

  it('RN-13: a recusa do servidor aparece com a mensagem dele', async () => {
    const otherAdmin = makeUser({ id: '6741a0c2f1d3a8b9c0e1f2ad', name: 'Bia Admin', username: 'bia', role: 'admin' })
    const { user } = setup(
      {
        [`PATCH /users/${otherAdmin.id}`]: {
          status: 409,
          data: { error: { code: 'CONFLICT', message: 'A empresa precisa de pelo menos um administrador ativo. Promova outra pessoa antes.' } },
        },
      },
      [me, otherAdmin],
    )
    await user.click(await screen.findByRole('button', { name: /Bia Admin/ }))
    const dialog = screen.getByRole('dialog', { name: 'Bia Admin' })
    await user.click(within(dialog).getByRole('button', { name: 'Desativar usuário' }))
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    expect(
      await within(dialog).findByText('A empresa precisa de pelo menos um administrador ativo. Promova outra pessoa antes.'),
    ).toBeInTheDocument()
  })

  it('redefinir a senha do bloqueado desbloqueia, e desativar pede confirmação', async () => {
    const { user, calls } = setup({
      [`POST /users/${joao.id}/reset-password`]: { status: 204 },
      [`PATCH /users/${joao.id}`]: { status: 200, data: { user: { ...joao, active: false } } },
    })
    await user.click(await screen.findByRole('button', { name: /João Lima/ }))
    let dialog = screen.getByRole('dialog', { name: 'João Lima' })
    await user.click(within(dialog).getByRole('button', { name: 'Redefinir senha e desbloquear' }))
    await user.type(within(dialog).getByLabelText('Nova senha temporária'), 'nova-senha-1')
    await user.click(within(dialog).getByRole('button', { name: 'Redefinir senha' }))

    expect(await screen.findByText(/Senha de João Lima redefinida/)).toBeInTheDocument()
    expect(calls.find((call) => call.url.endsWith('/reset-password'))?.data).toEqual({ password: 'nova-senha-1' })

    await user.click(screen.getByRole('button', { name: /João Lima/ }))
    dialog = screen.getByRole('dialog', { name: 'João Lima' })
    await user.click(within(dialog).getByRole('button', { name: 'Desativar usuário' }))
    expect(within(dialog).getByText(/sai de todos os aparelhos agora/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Desativar' }))

    expect(await screen.findByText('João Lima foi desativado e saiu de todos os aparelhos.')).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PATCH')?.data).toEqual({ active: false })
  })
})
