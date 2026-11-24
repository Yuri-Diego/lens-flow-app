import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { rememberRecentUser } from '@/lib/auth/recentUsers'
import { adminUser, mockApi, renderApp, unauthenticated } from '@/test/utils'

async function openLogin() {
  const view = renderApp('/login')
  await screen.findByRole('button', { name: 'Entrar' })
  return view
}

describe('Login', () => {
  it('valida no cliente: sem usuário e senha, mostra o erro junto de cada campo e não chama a API', async () => {
    const { calls } = mockApi({ 'GET /auth/me': unauthenticated() })
    const user = userEvent.setup()
    await openLogin()

    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(screen.getByLabelText('Usuário')).toHaveAccessibleDescription('Informe seu usuário.')
    expect(screen.getByLabelText('Usuário')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('Informe sua senha.')
    expect(screen.getByLabelText('Usuário')).toHaveFocus()
    expect(calls.some((call) => call.url === '/auth/login')).toBe(false)
  })

  it('mostra o erro genérico de credenciais e mantém o que foi digitado', async () => {
    mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': {
        status: 401,
        data: { error: { code: 'INVALID_CREDENTIALS', message: 'Usuário ou senha inválidos.' } },
      },
    })
    const user = userEvent.setup()
    await openLogin()

    await user.type(screen.getByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'senha-errada{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Usuário ou senha inválidos.')
    expect(screen.getByLabelText('Usuário')).toHaveValue('ana')
    expect(screen.getByLabelText('Senha')).toHaveValue('senha-errada')
  })

  it('mostra a mensagem de bloqueio do 429 como veio da API', async () => {
    mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': {
        status: 429,
        headers: { 'retry-after': '900' },
        data: { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde 15 min e tente de novo.' } },
      },
    })
    const user = userEvent.setup()
    await openLogin()

    await user.type(screen.getByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'qualquer-senha{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Aguarde 15 min e tente de novo.')
  })

  it('mostra o erro da API junto do campo, a partir de fields', async () => {
    mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': {
        status: 400,
        data: {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Confira os campos destacados.',
            fields: { password: 'A senha pode ter no máximo 64 caracteres.' },
          },
        },
      },
    })
    const user = userEvent.setup()
    await openLogin()

    await user.type(screen.getByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'x{Enter}')

    await waitFor(() =>
      expect(screen.getByLabelText('Senha')).toHaveAccessibleDescription('A senha pode ter no máximo 64 caracteres.'),
    )
  })

  it('desabilita o botão durante o envio e não envia duas vezes', async () => {
    let release: () => void = () => {}
    const { calls } = mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 200, data: { user: adminUser } })
        }),
    })
    const user = userEvent.setup()
    await openLogin()

    await user.type(screen.getByLabelText('Usuário'), 'ana')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123')
    await user.click(screen.getByRole('button', { name: 'Entrar' }))

    const button = await screen.findByRole('button', { name: 'Entrando…' })
    expect(button).toBeDisabled()
    await user.type(screen.getByLabelText('Senha'), '{Enter}')
    expect(calls.filter((call) => call.url === '/auth/login')).toHaveLength(1)

    release()
    expect(await screen.findByRole('heading', { name: 'Hoje' })).toBeInTheDocument()
  })

  it('mostra e oculta a senha', async () => {
    mockApi({ 'GET /auth/me': unauthenticated() })
    const user = userEvent.setup()
    await openLogin()

    const password = screen.getByLabelText('Senha')
    expect(password).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Mostrar senha' }))
    expect(password).toHaveAttribute('type', 'text')
    await user.click(screen.getByRole('button', { name: 'Ocultar senha' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('envia usuário sem espaços nas pontas e lembra o usuário neste aparelho (R16)', async () => {
    const { calls } = mockApi({
      'GET /auth/me': unauthenticated(),
      'POST /auth/login': { status: 200, data: { user: adminUser } },
    })
    const user = userEvent.setup()
    await openLogin()

    await user.type(screen.getByLabelText('Usuário'), '  ana ')
    await user.type(screen.getByLabelText('Senha'), 'senha-certa-123{Enter}')

    await screen.findByRole('heading', { name: 'Hoje' })
    expect(calls.find((call) => call.url === '/auth/login')?.data).toEqual({ username: 'ana', password: 'senha-certa-123' })
    expect(JSON.parse(localStorage.getItem('lf:recent-users') ?? '[]')).toEqual([{ username: 'ana', name: 'Ana Souza' }])
  })

  it('tocar num usuário recente preenche o usuário e leva o foco à senha', async () => {
    rememberRecentUser({ username: 'joao', name: 'João Lima' })
    mockApi({ 'GET /auth/me': unauthenticated() })
    const user = userEvent.setup()
    await openLogin()

    await user.click(screen.getByRole('button', { name: 'João Lima' }))

    expect(screen.getByLabelText('Usuário')).toHaveValue('joao')
    expect(screen.getByLabelText('Senha')).toHaveFocus()
  })
})
