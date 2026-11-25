import { expectScreen, fillLogin, goTo, loginInForm, newMovement, notice } from '../support/app'
import { sessionCookie } from '../support/session'
import { expect, test } from '../support/test'

test.describe('Login e logout', () => {
  test('entra com usuário e senha, vê o próprio nome e sai', async ({ page, context, lab }) => {
    // Sem sessão, qualquer tela leva ao login e volta para ela depois (RN-01).
    await page.goto('/conferencia')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)

    await loginInForm(page, lab.users.ana)
    await expectScreen(page, 'Conferência')

    // Sessão em cookie httpOnly, SameSite=Lax, só de /api e com 12 h (RN-14, T3).
    const cookie = await sessionCookie(context)
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/api' })
    const hours = ((cookie?.expires ?? 0) - Date.now() / 1000) / 3600
    expect(hours).toBeGreaterThan(11.9)
    expect(hours).toBeLessThanOrEqual(12)

    await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('heading', { name: 'Lens Flow' })).toBeVisible()
    expect(await sessionCookie(context)).toBeUndefined()

    // Voltar no navegador não reabre a tela logada.
    await page.goto('/conferencia')
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  })

  test('Enter entra, e a senha pode ser mostrada', async ({ page, lab }) => {
    await page.goto('/login')
    await page.getByLabel('Usuário').fill(lab.users.ana.username)
    const password = page.getByRole('textbox', { name: 'Senha' })
    await password.fill(lab.users.ana.password)
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Mostrar senha' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await password.press('Enter')
    await expectScreen(page, 'Hoje')
  })

  test('senha errada e usuário inexistente dão o mesmo erro genérico', async ({ page, lab }) => {
    await page.goto('/login')
    for (const [username, password] of [
      [lab.users.ana.username, 'senha-errada-1'],
      ['ninguem-aqui', 'senha-errada-1'],
    ]) {
      await fillLogin(page, username, password)
      await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible()
    }
    await expect(page).toHaveURL(/\/login$/)
  })

  test('cinco senhas erradas bloqueiam o usuário, mesmo com a senha certa; o admin desbloqueia', async ({
    page,
    lab,
    apiAs,
  }) => {
    const { ana, admin, joao } = lab.users
    await page.goto('/login')
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const response = page.waitForResponse('**/api/auth/login')
      await fillLogin(page, ana.username, `senha-errada-${attempt}`)
      expect((await response).status()).toBe(401)
      await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled()
    }

    const blocked = page.waitForResponse('**/api/auth/login')
    await fillLogin(page, ana.username, ana.password)
    expect((await blocked).status()).toBe(429)
    await expect(page.getByText(/Muitas tentativas\. Aguarde 15 min/)).toBeVisible()

    // O bloqueio é do usuário, não do aparelho: outra pessoa entra.
    await loginInForm(page, joao)
    await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()

    // Redefinir a senha desbloqueia na hora. Os 15 min ficam em tests/auth.test.js, no backend.
    const api = await apiAs(admin)
    const reset = await api.request.post(`/api/users/${ana.id}/reset-password`, { data: { password: 'senha-nova-456' } })
    expect(reset.status()).toBe(204)
    await loginInForm(page, { ...ana, password: 'senha-nova-456' })
  })

  test('"Trocar usuário" volta à mesma tela e guarda o rascunho de cada um (D12, R16)', async ({ page, lab }) => {
    await page.goto('/servicos/novo')
    await loginInForm(page, lab.users.ana)
    await newMovement.client(page).fill('Ótica da Ana')

    await page.getByRole('banner').getByRole('button', { name: 'Trocar usuário' }).click()
    await expect(page.getByRole('heading', { name: 'Trocar usuário' })).toBeVisible()
    await loginInForm(page, lab.users.joao)
    await expectScreen(page, 'Novo serviço')
    await expect(newMovement.client(page)).toHaveValue('')

    await page.getByRole('banner').getByRole('button', { name: 'Trocar usuário' }).click()
    // Quem já entrou neste aparelho aparece para escolher com um toque.
    await page.getByRole('button', { name: lab.users.ana.name }).click()
    await expect(page.getByLabel('Usuário')).toHaveValue(lab.users.ana.username)
    await page.getByRole('textbox', { name: 'Senha' }).fill(lab.users.ana.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(newMovement.client(page)).toHaveValue('Ótica da Ana')
  })

  test('troca a própria senha e entra com a nova', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana)
    await goTo(page, 'Minha conta')
    await page.getByRole('textbox', { name: 'Senha atual' }).fill(lab.users.ana.password)
    await page.getByRole('textbox', { name: 'Senha nova', exact: true }).fill('outra-senha-789')
    await page.getByRole('textbox', { name: 'Repita a senha nova' }).fill('outra-senha-789')
    await page.getByRole('button', { name: 'Trocar senha' }).click()
    await expect(notice(page, 'Senha trocada.')).toBeVisible()

    await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click()
    await loginInForm(page, { ...lab.users.ana, password: 'outra-senha-789' })
  })
})
