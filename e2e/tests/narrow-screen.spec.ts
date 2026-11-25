import type { Locator, Page } from '@playwright/test'
import { fillLogin, newMovement, notice, pickFreeBox, reviewRow } from '../support/app'
import { NARROW_SCREEN, expectSettled, expectWideFont, forceWideFont, sidewaysOverflows } from '../support/layout'
import { addDays, dayMonth } from '../support/lab'
import { expect, test } from '../support/test'

// Cada teste passa por várias telas e estados: `expect.soft` relata todos de uma vez.

// Os tamanhos máximos do contrato.
const LONG_CLIENT = 'ÓticaSupercalifragilística'.repeat(5).slice(0, 120)
const LONG_OS = 'OS2026WMWMWMWM'.repeat(3).slice(0, 40)
const LONG_NOTE = 'observaçãosemespaço'.repeat(10)
const LONG_PERSON = 'MaximilianoWenceslau'.repeat(4)

const selectBox = (page: Page, number: string) => page.getByRole('checkbox', { name: new RegExp(`^Selecionar caixa ${number},`) })

async function closeNotices(page: Page) {
  const close = page.getByRole('button', { name: 'Fechar aviso' })
  for (let left = await close.count(); left > 0; left -= 1) {
    await close.first().click()
    await expect(close).toHaveCount(left - 1)
  }
}

async function closeDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Fechar' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

for (const font of [
  { name: 'fonte padrão', wide: false },
  { name: 'fonte larga', wide: true },
]) {
  test.describe(`Celular de 360 px, ${font.name} (seção 7)`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(NARROW_SCREEN)
      if (font.wide) await forceWideFont(page)
    })

    /** Espera o estado aparecer (`ready`) e confere que nada passa da largura. */
    async function check(page: Page, state: string, ready: Locator) {
      await expect.soft(ready.first(), `${state}: o estado está na tela`).toBeVisible()
      await expectSettled(page)
      if (font.wide) await expectWideFont(page)
      expect.soft(await sidewaysOverflows(page), `${state}, ${font.name}, 360 px`).toEqual([])
    }

    test('todas as telas', async ({ page, openAs, apiAs, lab }) => {
      const admin = await apiAs(lab.users.admin)
      await admin.launch('1', 'Ótica de Hoje', '9001')
      expect((await admin.request.patch(`/api/boxes/${lab.boxes['61']}`, { data: { active: false } })).status()).toBe(200)
      expect((await admin.request.post('/api/boxes', { data: { number: '123456', color: 'azul' } })).status()).toBe(201)

      await page.goto('/login')
      await check(page, '/login', page.getByRole('button', { name: 'Entrar' }))
      await fillLogin(page, lab.users.joao.username, 'senha-errada')
      await check(page, '/login com erro', page.getByRole('alert'))

      await openAs(lab.users.admin)
      const main = page.getByRole('main')
      const screens: Array<[path: string, ready: Locator]> = [
        ['/hoje', main.getByText('Ótica de Hoje')],
        ['/servicos/novo', page.getByText('Na folha de hoje,')],
        ['/conferencia', reviewRow(page, '2', 'Ótica Central')],
        ['/conferencia?nivel=late', main.getByRole('button', { name: /^Tirar o filtro/ })],
        ['/conferencia?ordem=box', page.getByRole('list', { name: 'Pela prateleira' })],
        ['/conferencia?aba=liberar', reviewRow(page, '21', 'Ótica Cristal')],
        ['/buscar?q=otica', page.getByRole('list', { name: 'Resultados' })],
        ['/buscar?q=nadaassim', page.getByText('Nada encontrado')],
        ['/baixas', main.getByText('Ótica Cristal')],
        ['/folhas', main.getByText('Lançados', { exact: true })],
        [`/folhas/${addDays(lab.today, -1)}`, page.getByRole('list', { name: 'Serviços da folha' })],
        ['/mais', page.getByRole('navigation', { name: 'Mais opções' })],
        ['/caixas', page.getByRole('button', { name: /^Caixa 123456, livre/ })],
        ['/usuarios', page.getByRole('list', { name: 'Usuários' })],
        ['/conta', page.getByRole('form', { name: 'Trocar senha' })],
        [`/caixas/${lab.boxes['1']}`, page.getByTestId('box-state')],
        [`/caixas/${lab.boxes['50']}`, page.getByTestId('box-state')],
        [`/caixas/${lab.boxes['61']}`, page.getByTestId('box-state')],
        [`/servicos/${lab.movements['2']}`, page.getByRole('list', { name: 'Linha do tempo' })],
        ['/nao-existe', main.getByRole('heading')],
      ]
      for (const [path, ready] of screens) {
        await page.goto(path)
        await check(page, path, ready)
      }
    })

    test('Novo serviço: caixa livre, ocupada, desativada, avisos e "Sair"', async ({ openAs, apiAs, lab }) => {
      const admin = await apiAs(lab.users.admin)
      expect((await admin.request.patch(`/api/boxes/${lab.boxes['61']}`, { data: { active: false } })).status()).toBe(200)
      const joao = await apiAs(lab.users.joao)
      const page = await openAs(lab.users.ana, '/servicos/novo')
      const form = page.getByRole('form', { name: 'Novo serviço' })

      // Cores diferentes: o rótulo da caixa muda de largura.
      for (const number of ['1', '31', '41', '51']) {
        await pickFreeBox(page, number)
        await check(page, `Novo serviço, caixa ${number} livre`, form.getByText('Livre · escolhida'))
      }
      for (const number of ['2', '20', '60']) {
        await newMovement.box(page).fill(number)
        await check(page, `Novo serviço, caixa ${number} ocupada`, form.getByText(/^Ocupada por /))
      }
      await newMovement.box(page).fill('21')
      await check(page, 'Novo serviço, caixa que falta liberar', form.getByText(/O serviço já saiu; falta liberar/))
      await newMovement.box(page).fill('61')
      await check(page, 'Novo serviço, caixa desativada', form.getByText('A caixa 61 está desativada'))
      await newMovement.box(page).fill('999999')
      await check(page, 'Novo serviço, caixa que não existe', form.getByText('Não existe caixa 999999'))

      await newMovement.saveAndNext(page).click()
      await check(page, 'Novo serviço, erros nos campos', form.getByText('Informe o cliente.'))
      await newMovement.client(page).fill('ótica')
      await check(page, 'Novo serviço, sugestões de cliente', page.getByRole('listbox', { name: 'Clientes já usados' }))
      await newMovement.client(page).fill('Ótica do Aviso')
      await newMovement.orderService(page).fill('4521')
      await check(page, 'Novo serviço, OS repetida', form.getByText('OS repetida'))

      await pickFreeBox(page, '1')
      await newMovement.saveAndNext(page).click()
      await check(page, 'Novo serviço, aviso de lançado', notice(page, 'Lançado na caixa 1'))
      await closeNotices(page)

      // João ocupa a caixa 7 antes de o envio da Ana chegar à API.
      await page.route('**/api/movements', async (route) => {
        if (route.request().method() === 'POST') await joao.launch('7', 'Ótica do João')
        await route.continue()
      })
      await pickFreeBox(page, '7')
      await newMovement.client(page).fill('Ótica Recusada')
      await newMovement.saveAndNext(page).click()
      await expect(newMovement.toFix(page)).toContainText('Ótica Recusada')
      await check(page, 'Novo serviço, lançamento recusado', notice(page, 'Ótica Recusada'))

      await page.getByRole('banner').getByRole('button', { name: 'Sair' }).click()
      await check(page, 'Pergunta do "Sair"', page.getByRole('dialog', { name: 'Sair mesmo assim?' }))
    })

    test('Conferência, Baixas e serviço que já saiu', async ({ openAs, apiAs, lab }) => {
      const ana = await apiAs(lab.users.ana)
      const page = await openAs(lab.users.joao, '/conferencia')
      const out = reviewRow(page, '2', 'Ótica Central')

      await out.getByRole('checkbox', { name: 'Saiu' }).click()
      await check(page, 'Conferência, aviso com "Desfazer"', notice(page, 'Baixa dada: caixa 2'))
      await closeNotices(page)
      await check(page, 'Conferência, linha que saiu', out.getByRole('button', { name: 'Liberar', exact: true }))
      await page.getByRole('button', { name: 'Trocar caixa de Ótica São João' }).click()
      await check(page, 'Conferência, trocar caixa', page.getByRole('dialog', { name: 'Trocar caixa' }))
      await closeDialog(page)

      // Modo seleção: nada marcado, tudo marcado e o lote que falha em parte.
      await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
      await check(page, 'Conferência, seleção vazia', page.getByRole('button', { name: 'Dar baixa e liberar (0)' }))
      await page.getByRole('button', { name: 'Selecionar visíveis' }).click()
      await check(page, 'Conferência, seleção com tudo', page.getByRole('button', { name: 'Limpar seleção' }))
      await page.getByRole('button', { name: 'Limpar seleção' }).click()
      await ana.checkout(lab.movements['10'])
      await ana.release(lab.movements['10'])
      await selectBox(page, '10').click()
      await selectBox(page, '20').click()
      await page.getByRole('button', { name: 'Dar baixa e liberar (2)' }).click()
      await expect(notice(page, '1 falhou.')).toBeVisible()
      await check(page, 'Conferência, lote com falha', page.getByText('1 serviço não foi alterado'))

      await page.goto('/conferencia?aba=liberar')
      await check(page, 'Falta liberar', reviewRow(page, '21', 'Ótica Cristal'))
      await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
      await selectBox(page, '21').click()
      await check(page, 'Falta liberar, seleção', page.getByRole('button', { name: 'Liberar caixas (1)' }))

      // João deu baixa na 2 e liberou a 20 há menos de 10 min: "Desfazer" com o tempo.
      await page.goto('/baixas')
      await expect(page.getByRole('button', { name: /^Desfazer baixa \(\d+:\d{2}\)$/ })).toBeVisible()
      await check(page, '/baixas com "Desfazer"', page.getByRole('button', { name: /^Desfazer liberação \(\d+:\d{2}\)$/ }))
      await page.getByLabel('Quem deu baixa').selectOption({ label: 'João Lima (eu)' })
      await check(page, '/baixas filtrada', page.getByRole('region', { name: `Baixas de ${dayMonth(lab.today)}` }))

      for (const [number, undo] of [
        ['2', 'Desfazer baixa'],
        ['20', 'Desfazer liberação'],
      ]) {
        await page.goto(`/servicos/${lab.movements[number]}`)
        await check(page, `Serviço que já saiu, "${undo}"`, page.getByRole('button', { name: new RegExp(`^${undo} \\(`) }))
      }
      await page.getByRole('button', { name: /^Desfazer liberação/ }).click()
      await check(page, 'Serviço, liberação desfeita', notice(page, 'Liberação desfeita'))
      await page.goto(`/servicos/${lab.movements['21']}`)
      await check(page, 'Serviço que saiu ontem', page.getByRole('button', { name: 'Liberar caixa' }))
      await page.goto(`/caixas/${lab.boxes['21']}`)
      await check(page, 'Caixa que falta liberar', page.getByTestId('box-state'))
    })

    test('diálogos de serviço, caixa e usuário', async ({ openAs, lab }) => {
      const page = await openAs(lab.users.admin, `/servicos/${lab.movements['2']}`)
      const dialog = page.getByRole('dialog')

      await page.getByRole('button', { name: 'Trocar caixa' }).click()
      await check(page, 'Trocar caixa, vazio', dialog.getByLabel('Caixa nova'))
      for (const [number, text] of [
        ['1', 'Livre · escolhida'],
        ['31', 'Livre · escolhida'],
        ['20', /^Ocupada por /],
        ['2', 'Essa já é a caixa do serviço.'],
        ['999999', 'Não existe caixa 999999'],
      ] as const) {
        await dialog.getByLabel('Caixa nova').fill(number)
        await check(page, `Trocar caixa, ${number}`, dialog.getByText(text))
      }
      await closeDialog(page)
      await page.getByRole('button', { name: 'Excluir' }).click()
      await check(page, 'Excluir lançamento', page.getByRole('dialog', { name: 'Excluir lançamento?' }))
      await closeDialog(page)
      await page.getByRole('button', { name: 'Editar' }).click()
      await check(page, 'Editar serviço', page.getByRole('form', { name: 'Editar serviço' }))

      await page.goto('/caixas')
      await page.getByRole('button', { name: 'Cadastrar caixas' }).first().click()
      await check(page, 'Cadastrar caixas, vazio', dialog.getByLabel('Números'))
      await dialog.getByRole('button', { name: 'Cadastrar', exact: true }).click()
      await check(page, 'Cadastrar caixas, erros', dialog.getByText('Escolha a cor das caixas.'))
      await dialog.getByRole('radio', { name: /Vermelha/ }).click()
      await dialog.getByLabel('Números').fill('101, 123456, 2, 101, 008-020')
      await check(page, 'Cadastrar caixas, pré-visualização', dialog.getByText(/^Vai criar /))
      await dialog.getByRole('button', { name: /^Cadastrar \d+ caixas$/ }).click()
      await check(page, 'Cadastrar caixas, resultado', page.getByRole('dialog', { name: 'Resultado do cadastro' }))
      await dialog.getByRole('button', { name: 'Concluir' }).click()

      await page.getByRole('button', { name: 'Caixa 61, livre. Editar' }).click()
      await check(page, 'Editar caixa livre', page.getByRole('form', { name: 'Editar caixa 61' }))
      await dialog.getByRole('button', { name: 'Desativar caixa' }).click()
      await check(page, '/caixas, aviso de desativada', notice(page, 'Caixa 61 desativada.'))
      await closeNotices(page)
      await page.getByRole('button', { name: /^Caixa 61, desativada/ }).click()
      await check(page, 'Editar caixa desativada', dialog.getByRole('button', { name: 'Reativar caixa' }))

      await page.goto('/usuarios')
      await page.getByRole('button', { name: 'Novo usuário' }).click()
      await check(page, 'Novo usuário, vazio', dialog.getByRole('form', { name: 'Novo usuário' }))
      await dialog.getByRole('button', { name: 'Criar usuário' }).click()
      await check(page, 'Novo usuário, erros', dialog.locator('[aria-invalid=true]'))
      await closeDialog(page)
      await page.getByRole('button', { name: /Adriana Admin/ }).click()
      await check(page, 'Usuário, o próprio e único admin', dialog.getByText('É o único administrador ativo.', { exact: false }))
      await closeDialog(page)
      await page.getByRole('button', { name: /Ana Souza/ }).click()
      await dialog.getByRole('button', { name: 'Redefinir senha' }).click()
      await check(page, 'Usuário, redefinir senha', dialog.getByRole('button', { name: 'Gerar senha' }))
      await dialog.getByRole('button', { name: 'Desativar usuário' }).click()
      await check(page, 'Usuário, confirmar desativação', dialog.getByText('Desativar Ana Souza?', { exact: false }))
    })

    test('cliente, OS, observação e nome de usuário longos e sem espaço', async ({ openAs, apiAs, lab }) => {
      const admin = await apiAs(lab.users.admin)
      for (const user of [lab.users.ana, lab.users.admin]) {
        expect((await admin.request.patch(`/api/users/${user.id}`, { data: { name: LONG_PERSON } })).status()).toBe(200)
      }
      const ana = await apiAs(lab.users.ana)
      const today = await ana.launch('1', LONG_CLIENT, LONG_OS)
      // Um de hoje, um pendente de ontem, um urgente e um que já saiu.
      for (const id of [today.id, lab.movements['2'], lab.movements['50'], lab.movements['21']]) {
        const data = { clientName: LONG_CLIENT, orderService: LONG_OS, note: LONG_NOTE }
        expect((await admin.request.patch(`/api/movements/${id}`, { data })).status()).toBe(200)
      }

      // Em Baixas: quem deu baixa, quem liberou e o "Desfazer" do admin.
      await admin.checkout(lab.movements['20'])
      await admin.release(lab.movements['20'])

      // O admin vê tudo e pode tudo: o nome longo está no cabeçalho, nas linhas e nos diálogos.
      const page = await openAs(lab.users.admin)
      const main = page.getByRole('main')
      const dialog = page.getByRole('dialog')
      const client = main.getByText(LONG_CLIENT.slice(0, 40), { exact: false })
      const person = main.getByText(LONG_PERSON.slice(0, 30), { exact: false })

      const screens: Array<[path: string, ready: Locator]> = [
        ['/hoje', client],
        ['/conferencia', client],
        ['/conferencia?aba=liberar', client],
        ['/buscar?q=Supercali', client],
        ['/baixas', main.getByText(`liberada por ${LONG_PERSON.slice(0, 30)}`, { exact: false })],
        [`/folhas/${addDays(lab.today, -1)}`, client],
        ['/usuarios', person],
        ['/conta', person],
        [`/caixas/${lab.boxes['1']}`, client],
      ]
      for (const [path, ready] of screens) {
        await page.goto(path)
        await check(page, `${path}, textos longos`, ready)
      }

      await page.goto('/servicos/novo')
      await newMovement.box(page).fill('1')
      await check(page, 'Novo serviço, ocupada por texto longo', page.getByText(/^Ocupada por /))
      await newMovement.client(page).fill('óticasuper')
      await check(page, 'Novo serviço, sugestão longa', page.getByRole('listbox', { name: 'Clientes já usados' }))
      await newMovement.orderService(page).fill(LONG_OS)
      await check(page, 'Novo serviço, OS repetida longa', page.getByText('OS repetida'))

      await page.goto('/conferencia')
      await reviewRow(page, '2', LONG_CLIENT).getByRole('checkbox', { name: 'Saiu' }).click()
      await check(page, 'Conferência, aviso com texto longo', notice(page, 'Baixa dada: caixa 2'))
      // Abre de novo: um estouro tira o "Fechar aviso" do alcance, e o resto ficaria sem medida.
      await page.goto('/conferencia?aba=liberar')
      await check(page, 'Falta liberar, textos longos', reviewRow(page, '2', LONG_CLIENT))
      await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
      await check(page, 'Falta liberar, seleção com textos longos', selectBox(page, '2'))

      await page.goto(`/servicos/${today.id}`)
      await check(page, 'Serviço, textos longos', page.getByRole('list', { name: 'Linha do tempo' }))
      await page.getByRole('button', { name: 'Trocar caixa' }).click()
      await dialog.getByLabel('Caixa nova').fill('50')
      await check(page, 'Trocar caixa, textos longos', dialog.getByText(/^Ocupada por /))
      await closeDialog(page)
      await page.getByRole('button', { name: 'Excluir' }).click()
      await check(page, 'Excluir lançamento, texto longo', dialog)
      await closeDialog(page)

      await page.goto('/usuarios')
      await page.getByRole('button', { name: new RegExp(lab.users.ana.username) }).click()
      await dialog.getByRole('button', { name: 'Desativar usuário' }).click()
      await check(page, 'Usuário, nome longo', dialog.getByText('A pessoa sai de todos os aparelhos', { exact: false }))
    })
  })
}
