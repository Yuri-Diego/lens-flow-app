import { expectApiError } from '../support/api'
import { expectScreen, goTo, loginInForm, mainNav, newMovement, notice, pickFreeBox } from '../support/app'
import { expect, test } from '../support/test'

test.describe('Administração', () => {
  test('cadastra caixas em lote, com intervalo, e o resultado vem item a item (RN-13)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.admin)
    await goTo(page, 'Caixas')
    await expect(page.getByText('16 ativas · 8 livres · 8 ocupadas')).toBeVisible()
    await page.getByRole('button', { name: 'Cadastrar caixas' }).first().click()

    const dialog = page.getByRole('dialog', { name: 'Cadastrar caixas' })
    await dialog.getByRole('radio', { name: /Vermelha/ }).click()
    // A 2 já existe (em outra cor, D4), a 101 se repete e 008-009 guarda o zero (D18).
    await dialog.getByLabel('Números').fill('101, 103-105, 2, 101, 008-009')
    const preview = dialog.getByRole('region', { name: 'Pré-visualização' })
    await expect(preview).toContainText('Vai criar 6 caixas na cor Vermelha. 2 números não entram.')
    await expect(preview).toContainText('2: já existe (Branca)')
    await dialog.getByRole('button', { name: 'Cadastrar 6 caixas' }).click()

    const result = page.getByRole('dialog', { name: 'Resultado do cadastro' })
    await expect(result).toContainText('6 caixas criadas · 2 não entraram')
    const items = result.getByRole('list', { name: 'Resultado item a item' }).getByRole('listitem')
    await expect(items).toHaveText([
      /^101\s*criada/,
      /^103\s*criada/,
      /^104\s*criada/,
      /^105\s*criada/,
      /^2\s*Já existe a caixa 2 \(Branca\)/,
      /^101\s*Número repetido neste lote/,
      /^008\s*criada/,
      /^009\s*criada/,
    ])
    await result.getByRole('button', { name: 'Concluir' }).click()

    const red = page.getByRole('region', { name: 'Caixas Vermelha' })
    await expect(red.getByRole('button', { name: 'Caixa 104, livre. Editar' })).toBeVisible()
    await expect(red.getByRole('button', { name: 'Caixa 008, livre. Editar' })).toBeVisible()
    // A ocupada leva ao serviço.
    await red.getByRole('link', { name: 'Caixa 50, ocupada: Ótica Bela Vista. Abrir o serviço' }).click()
    await expectScreen(page, 'Ótica Bela Vista')

    // A caixa nova já recebe serviço.
    await page.goto('/servicos/novo')
    await pickFreeBox(page, '008')
  })

  test('desativa uma caixa livre, que deixa de receber serviço (RN-05)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.admin, '/caixas')
    await page.getByRole('button', { name: 'Caixa 61, livre. Editar' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Desativar/ }).click()
    await expect(notice(page, 'Caixa 61 desativada. Ela não recebe mais serviço.')).toBeVisible()

    await page.goto('/servicos/novo')
    await newMovement.box(page).fill('61')
    await expect(page.getByText('A caixa 61 está desativada e não recebe serviço.')).toBeVisible()
  })

  test('cria um usuário, que entra com a senha temporária e trabalha', async ({ openAs, browser, lab, extraHTTPHeaders }) => {
    const page = await openAs(lab.users.admin)
    await goTo(page, 'Usuários')
    await page.getByRole('button', { name: 'Novo usuário' }).click()
    const dialog = page.getByRole('dialog', { name: 'Novo usuário' })
    const username = `${lab.users.admin.username}-nova`.slice(0, 30)
    await dialog.getByRole('textbox', { name: 'Nome' }).fill('Carla Nova')
    await dialog.getByRole('textbox', { name: 'Usuário' }).fill(username)
    // A senha temporária fica visível para o admin ditar (D25).
    const password = dialog.getByRole('textbox', { name: 'Senha temporária' })
    await dialog.getByRole('button', { name: 'Gerar senha' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await expect(password).toHaveValue(/^[a-z0-9]{10}$/)
    const temporary = await password.inputValue()
    await dialog.getByRole('button', { name: 'Criar usuário' }).click()
    await expect(notice(page, 'Carla Nova pode entrar com o usuário')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Usuários' })).toContainText('Carla Nova')
    await expect(page.getByRole('list', { name: 'Usuários' })).toContainText('ainda não entrou')

    const context = await browser.newContext({ extraHTTPHeaders })
    const other = await context.newPage()
    await other.goto('/login')
    await loginInForm(other, { id: '', name: 'Carla Nova', username, password: temporary })
    await expect(other.getByRole('banner')).toContainText('Operador')
    await context.close()
  })

  test('o único admin não se desativa nem se rebaixa; com outro admin, pode se rebaixar (RN-13, D20)', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const { admin, ana } = lab.users
    const api = await apiAs(admin)
    const page = await openAs(admin, '/usuarios')
    await page.getByRole('button', { name: /Adriana Admin/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Adriana Admin' })
    await expect(dialog.getByRole('radio', { name: /Operador/ })).toBeDisabled()
    await expect(dialog.getByRole('button', { name: 'Desativar usuário' })).toBeDisabled()
    await expect(dialog).toContainText('É o único administrador ativo.')
    await expectApiError(await api.request.patch(`/api/users/${admin.id}`, { data: { role: 'operator' } }), 409, 'CONFLICT')
    await expectApiError(await api.request.patch(`/api/users/${admin.id}`, { data: { active: false } }), 409, 'CONFLICT')

    expect((await api.request.patch(`/api/users/${ana.id}`, { data: { role: 'admin' } })).status()).toBe(200)
    await page.reload()
    await page.getByRole('button', { name: /Adriana Admin/ }).click()
    await dialog.getByRole('radio', { name: /Operador/ }).check()
    await dialog.getByRole('button', { name: 'Salvar' }).click()
    // O perfil muda na hora: a tela some para quem deixou de ser admin.
    await expect(page.getByText('Você não tem acesso a esta tela')).toBeVisible()
    await expect(page.getByRole('banner')).toContainText('Operador')
  })
})

test.describe('Operador', () => {
  test('é barrado nas telas e na API de administração', async ({ openAs, apiAs, lab }) => {
    // Em "Mais" e, no computador, também na barra lateral.
    const page = await openAs(lab.users.ana, '/mais')
    await expect(page.getByRole('navigation', { name: 'Mais opções' }).getByRole('link', { name: 'Baixas' })).toBeVisible()
    await expect(mainNav(page)).toBeVisible()
    await expect(page.getByRole('link', { name: 'Caixas' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Usuários' })).toHaveCount(0)

    for (const path of ['/caixas', '/usuarios']) {
      await page.goto(path)
      await expect(page.getByText('Você não tem acesso a esta tela')).toBeVisible()
      await expect(page.getByRole('button', { name: /Cadastrar caixas|Novo usuário/ })).toHaveCount(0)
    }

    const { request } = await apiAs(lab.users.ana)
    const box = lab.boxes['1']
    await expectApiError(await request.get('/api/users'), 403, 'FORBIDDEN')
    await expectApiError(await request.get('/api/audit'), 403, 'FORBIDDEN')
    await expectApiError(await request.post('/api/boxes', { data: { number: '900', color: 'azul' } }), 403, 'FORBIDDEN')
    await expectApiError(await request.post('/api/boxes/batch', { data: { numbers: '900', color: 'azul' } }), 403, 'FORBIDDEN')
    await expectApiError(await request.patch(`/api/boxes/${box}`, { data: { active: false } }), 403, 'FORBIDDEN')
    await expectApiError(
      await request.post(`/api/users/${lab.users.joao.id}/reset-password`, { data: { password: 'qualquer-senha' } }),
      403,
      'FORBIDDEN',
    )
  })

  test('vê uma caixa só para leitura (D21)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.joao, `/servicos/${lab.movements['50']}`)
    await page.getByRole('link', { name: 'Caixa 50, Vermelha, Urgente' }).click()
    await expectScreen(page, 'Caixa 50')
    await expect(page.getByText('Vermelha · Urgente').first()).toBeVisible()
    await expect(page.getByTestId('box-state')).toHaveText('Ocupada')
    await expect(page.getByRole('link', { name: /Serviço atual.*Ótica Bela Vista/ })).toBeVisible()
    await expect(page.getByRole('main').getByRole('button', { name: /Editar|Desativar|Salvar/ })).toHaveCount(0)
    await expect(page.getByRole('main').getByRole('link', { name: 'Caixas' })).toHaveCount(0)
  })

  test('não corrige o lançamento de outra pessoa nem o de outro dia (RN-11)', async ({ openAs, apiAs, lab }) => {
    const joao = await apiAs(lab.users.joao)
    const ana = await apiAs(lab.users.ana)
    const fromJoao = await joao.launch('1', 'Ótica do João')
    const own = await ana.launch('7', 'Ótica da Ana')
    const page = await openAs(lab.users.ana)
    const edit = page.getByRole('button', { name: 'Editar' })
    const remove = page.getByRole('button', { name: 'Excluir' })

    // O próprio, de hoje: pode.
    await page.goto(`/servicos/${own.id}`)
    await expect(edit).toBeVisible()
    await expect(remove).toBeVisible()

    // O de outra pessoa (hoje) e o próprio de ontem: só trocar a caixa (D19).
    for (const id of [fromJoao.id, lab.movements['2']]) {
      await page.goto(`/servicos/${id}`)
      await expect(page.getByRole('button', { name: 'Trocar caixa' })).toBeVisible()
      await expect(edit).toBeHidden()
      await expect(remove).toBeHidden()
      const changed = await ana.request.patch(`/api/movements/${id}`, { data: { clientName: 'Mudado' } })
      await expectApiError(changed, 403, 'FORBIDDEN')
      await expectApiError(await ana.request.delete(`/api/movements/${id}`), 403, 'FORBIDDEN')
    }
  })
})
