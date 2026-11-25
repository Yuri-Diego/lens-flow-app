import { expectApiError } from '../support/api'
import { expectScreen, loginInForm, newMovement, notice, pickFreeBox } from '../support/app'
import { createLab } from '../support/lab'
import { expireSession, sessionCookie } from '../support/session'
import { expect, test } from '../support/test'

test.describe('Sessão', () => {
  test('sessão expirada leva ao login com aviso, volta à mesma tela e guarda o rascunho (RN-14, R17)', async ({
    openAs,
    context,
    lab,
  }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await newMovement.client(page).fill('Ótica do Rascunho')
    await newMovement.note(page).fill('não perder')
    await expireSession(context)

    // A próxima chamada à API (a busca da caixa) descobre que a sessão venceu.
    await newMovement.box(page).fill('1')
    await expect(page.getByText('Sua sessão expirou. Entre de novo.')).toBeVisible()
    await expect(page).toHaveURL(/\/login$/)
    expect(await sessionCookie(context)).toBeUndefined()

    await loginInForm(page, lab.users.ana)
    await expectScreen(page, 'Novo serviço')
    await expect(newMovement.box(page)).toHaveValue('1')
    await expect(newMovement.client(page)).toHaveValue('Ótica do Rascunho')
    await expect(newMovement.note(page)).toHaveValue('não perder')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 1: Ótica do Rascunho.')).toBeVisible()
  })

  test('sessão expirada ao recarregar a página também pede login', async ({ openAs, context, lab }) => {
    const page = await openAs(lab.users.ana, '/conferencia?ordem=box')
    await expectScreen(page, 'Conferência')
    await expireSession(context)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await loginInForm(page, lab.users.ana)
    await expect(page).toHaveURL(/\/conferencia\?ordem=box$/)
  })

  test('desativar o usuário derruba a sessão dele na hora', async ({ openAs, apiAs, lab }) => {
    const page = await openAs(lab.users.ana, '/conferencia')
    await expectScreen(page, 'Conferência')
    const admin = await apiAs(lab.users.admin)
    const response = await admin.request.patch(`/api/users/${lab.users.ana.id}`, { data: { active: false } })
    expect(response.status()).toBe(200)

    await page.getByRole('link', { name: 'Buscar' }).click()
    await page.getByRole('searchbox').fill('ótica')
    await expect(page.getByText('Sua sessão não é mais válida. Entre de novo.')).toBeVisible()
    await page.getByLabel('Usuário').fill(lab.users.ana.username)
    await page.getByRole('textbox', { name: 'Senha' }).fill(lab.users.ana.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page.getByText('Usuário ou senha inválidos.')).toBeVisible()
  })
})

test.describe('Isolamento entre empresas', () => {
  test('uma empresa não vê nem altera nada da outra', async ({ openAs, apiAs, lab }) => {
    const other = await createLab()
    const otherAna = await apiAs(other.users.ana, other)
    const secret = await otherAna.launch('1', 'Ótica Da Outra Empresa', 'SEGREDO-1')

    const page = await openAs(lab.users.admin, `/servicos/${secret.id}`)
    await expect(page.getByText('Serviço não encontrado')).toBeVisible()
    await page.goto(`/caixas/${other.boxes['1']}`)
    await expect(page.getByText('Caixa não encontrada')).toBeVisible()

    for (const term of ['outra empresa', 'SEGREDO-1']) {
      await page.goto(`/buscar?q=${encodeURIComponent(term)}`)
      await expect(page.getByText('Nada encontrado')).toBeVisible()
    }
    await page.goto('/hoje')
    await expect(page.getByText('Nenhum serviço lançado hoje')).toBeVisible()

    // Mesmo número, caixas diferentes: a 1 da outra empresa está ocupada, a desta está livre.
    await page.goto('/servicos/novo')
    await pickFreeBox(page, '1')
    await newMovement.client(page).pressSequentially('ótica da')
    await expect(page.getByRole('option', { name: /Outra Empresa/ })).toHaveCount(0)

    const { request } = await apiAs(lab.users.admin)
    const calls = [
      request.get(`/api/movements/${secret.id}`),
      request.patch(`/api/movements/${secret.id}`, { data: { clientName: 'Invadido' } }),
      request.delete(`/api/movements/${secret.id}`),
      request.post(`/api/movements/${secret.id}/checkout`),
      request.post(`/api/movements/${secret.id}/change-box`, { data: { boxId: lab.boxes['7'] } }),
      request.post('/api/movements', { data: { boxId: other.boxes['7'], clientName: 'Invasor' } }),
      request.patch(`/api/boxes/${other.boxes['7']}`, { data: { active: false } }),
      request.patch(`/api/users/${other.users.joao.id}`, { data: { active: false } }),
    ]
    for (const call of calls) await expectApiError(await call, 404, 'NOT_FOUND')
    expect((await otherAna.movement(secret.id)).clientName).toBe('Ótica Da Outra Empresa')
  })
})
