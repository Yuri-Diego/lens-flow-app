import type { Locator, Page, Request } from '@playwright/test'
import { expectScreen, goTo, newMovement, notice, pickFreeBox } from '../support/app'
import { addDays, dayMonth } from '../support/lab'
import { expect, test } from '../support/test'

const isLaunch = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/movements'

async function openNewMovement(page: Page) {
  await page.getByRole('link', { name: 'Novo serviço', exact: true }).click()
  await expectScreen(page, 'Novo serviço')
}

const todayList = (page: Page) => page.getByRole('list', { name: 'Serviços de hoje' })

/** Com a próxima caixa já escolhida, que é quando os botões são usados. */
async function expectNotCovered(page: Page, toast: Locator) {
  await expect(toast).toBeVisible()
  await pickFreeBox(page, '31')
  for (const button of [newMovement.saveAndNext(page), newMovement.finish(page)]) {
    // `trial` confere, sem clicar, que o clique chegaria ao botão; as caixas cobrem o resto da área.
    await button.click({ trial: true, timeout: 3_000 })
    const [a, b] = [await button.boundingBox(), await toast.boundingBox()]
    if (!a || !b) throw new Error('O botão e o aviso precisam estar na tela.')
    const overlaps = b.x < a.x + a.width && a.x < b.x + b.width && b.y < a.y + a.height && a.y < b.y + b.height
    expect(overlaps, 'o aviso cobre o botão').toBe(false)
  }
}

test.describe('Novo serviço', () => {
  test('operador lança 3 serviços só com Enter, com uma caixa ocupada no meio', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana)
    await openNewMovement(page)
    // Abre com o foco no primeiro campo, pronto para digitar (R2).
    await expect(newMovement.box(page)).toBeFocused()

    // 1º: caixa, cliente, OS e observação, sempre com Enter.
    await pickFreeBox(page, '1')
    await page.keyboard.press('Enter')
    await expect(newMovement.client(page)).toBeFocused()
    await page.keyboard.type('Ótica Primeira')
    await page.keyboard.press('Enter')
    await expect(newMovement.orderService(page)).toBeFocused()
    await page.keyboard.type('9001')
    await page.keyboard.press('Enter')
    await expect(newMovement.note(page)).toBeFocused()
    await page.keyboard.type('aguardando armação')
    await page.keyboard.press('Enter')
    await expect(notice(page, 'Lançado na caixa 1: Ótica Primeira.')).toBeVisible()
    // "Salvar e próximo": limpo e com o foco de volta na caixa.
    await expect(newMovement.box(page)).toHaveValue('')
    await expect(newMovement.box(page)).toBeFocused()

    // 2º: a caixa 2 está ocupada desde ontem. A tela diz por quem e não avança.
    await newMovement.box(page).fill('2')
    await expect(page.getByText('Ocupada', { exact: true })).toBeVisible()
    const reason = `Ocupada por Ótica Central, lançado por Ana Souza em ${dayMonth(addDays(lab.today, -1))}.`
    await expect(page.getByText(reason, { exact: true })).toBeVisible()
    await page.keyboard.press('Enter')
    await expect(newMovement.box(page)).toBeFocused()
    await expect(page.getByText(`${reason} Escolha outra caixa.`)).toBeVisible()
    await newMovement.client(page).fill('Ótica Segunda')
    await newMovement.saveAndNext(page).click()
    // Nada do que foi digitado se perde.
    await expect(newMovement.client(page)).toHaveValue('Ótica Segunda')
    await pickFreeBox(page, '31')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 31: Ótica Segunda.')).toBeVisible()

    // 3º: "Concluir" salva e volta para Hoje.
    await pickFreeBox(page, '51')
    await newMovement.client(page).fill('Ótica Terceira')
    await newMovement.finish(page).click()
    await expectScreen(page, 'Hoje')

    const rows = todayList(page).getByRole('listitem')
    await expect(rows).toHaveCount(3)
    // Do mais recente ao mais antigo, com a categoria que vem da cor (RN-04).
    await expect(rows.nth(0)).toContainText('Ótica Terceira')
    await expect(rows.nth(0).getByRole('img', { name: 'Caixa 51, Vermelha, Urgente' })).toBeVisible()
    // A vermelha lançada hoje já é "Normal"; as outras, "Em dia" (D15).
    await expect(rows.nth(0)).toContainText('Normal')
    await expect(rows.nth(1).getByRole('img', { name: 'Caixa 31, Verde, Com montagem' })).toBeVisible()
    await expect(rows.nth(1)).toContainText('Em dia')
    await expect(rows.nth(2)).toContainText('OS 9001 · aguardando armação')
    await expect(rows.nth(2)).toContainText('Lançado por Ana Souza')
    await expect(page.getByRole('heading', { name: 'Lançados hoje (3)' })).toBeVisible()
  })

  test('caixa ocupada entre a busca e o envio: "Salvar e próximo" guarda o lançamento para corrigir', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    // João ocupa a caixa depois que a tela da Ana a conferiu e antes de o envio chegar à API.
    let raced = false
    await page.route('**/api/movements', async (route) => {
      if (isLaunch(route.request()) && !raced) {
        raced = true
        await joao.launch('1', 'Ótica do João')
      }
      await route.continue()
    })

    await pickFreeBox(page, '1')
    await newMovement.client(page).fill('Ótica da Ana')
    await newMovement.orderService(page).fill('9100')
    const response = page.waitForResponse((res) => isLaunch(res.request()))
    await newMovement.saveAndNext(page).click()
    const refused = await response
    expect(refused.status()).toBe(409)
    expect((await refused.json()).error.code).toBe('BOX_OCCUPIED')

    const toFix = newMovement.toFix(page)
    await expect(toFix).toContainText('Caixa 1 · Ótica da Ana: não foi lançada')
    await expect(toFix).toContainText('A caixa 1 já está ocupada: Ótica do João, lançado por João Lima')

    // F7-2: corrigir pela lista fecha o aviso vermelho, que não some sozinho.
    const refusedNotice = notice(page, 'Caixa 1 (Ótica da Ana) não foi lançada.')
    await expect(refusedNotice).toBeVisible()
    await toFix.getByRole('button', { name: 'Corrigir' }).click()
    await expect(refusedNotice).toBeHidden()
    await expect(newMovement.box(page)).toHaveValue('1')
    await expect(newMovement.client(page)).toHaveValue('Ótica da Ana')
    await expect(newMovement.orderService(page)).toHaveValue('9100')
    await pickFreeBox(page, '7')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica da Ana.')).toBeVisible()
    await expect(toFix).toBeHidden()
  })

  test('sem rede, nada se perde e o reenvio não lança duas vezes (R13)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const keys: string[] = []
    // A 1ª tentativa chega ao servidor, mas a resposta se perde no caminho.
    await page.route('**/api/movements', async (route) => {
      if (!isLaunch(route.request())) return route.continue()
      keys.push(route.request().postDataJSON().clientRequestId)
      if (keys.length > 1) return route.continue()
      await route.fetch()
      await route.abort('connectionreset')
    })

    await pickFreeBox(page, '41')
    await newMovement.client(page).fill('Ótica Sem Rede')
    await newMovement.saveAndNext(page).click()
    const toFix = newMovement.toFix(page)
    await expect(toFix).toContainText('Caixa 41 · Ótica Sem Rede: não foi lançada')

    await toFix.getByRole('button', { name: 'Corrigir' }).click()
    await expect(newMovement.client(page)).toHaveValue('Ótica Sem Rede')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 41: Ótica Sem Rede.')).toBeVisible()
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])

    await goTo(page, 'Hoje')
    await expect(todayList(page).getByRole('listitem')).toHaveCount(1)
  })

  test('"7" e "007" são caixas diferentes (D18)', async ({ openAs, apiAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await pickFreeBox(page, '7')
    await newMovement.client(page).fill('Ótica do Sete')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica do Sete.')).toBeVisible()

    // A 007 continua livre; "07" não existe.
    await newMovement.box(page).fill('07')
    await expect(page.getByText('Não existe caixa 07.', { exact: false }).first()).toBeVisible()
    await pickFreeBox(page, '007')
    await newMovement.client(page).fill('Ótica Zero Zero Sete')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 007: Ótica Zero Zero Sete.')).toBeVisible()

    const api = await apiAs(lab.users.joao)
    expect(await api.boxState('7')).toBe('occupied')
    expect(await api.boxState('007')).toBe('occupied')

    await goTo(page, 'Buscar')
    const results = page.getByRole('list', { name: 'Resultados' }).getByRole('listitem')
    await page.getByRole('searchbox').fill('007')
    await expect(results).toHaveCount(1)
    await expect(results).toContainText('Ótica Zero Zero Sete')
    await page.getByRole('searchbox').fill('7')
    await expect(results).toContainText(['Ótica do Sete'])
    await expect(results).toHaveCount(1)
  })

  test('OS repetida avisa onde ela está e não bloqueia (D16)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.joao, '/servicos/novo')
    const where = `A OS 4521 já está na caixa 2 (Branca), aberta desde ${dayMonth(addDays(lab.today, -1))}.`
    await pickFreeBox(page, '61')
    await newMovement.client(page).fill('Ótica Repetida')
    await newMovement.orderService(page).fill('4521')
    await expect(page.getByText(`${where} Você pode lançar mesmo assim.`)).toBeVisible()
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, `Lançado na caixa 61: Ótica Repetida. ${where}`)).toBeVisible()
  })

  test('a OS repetida ignora maiúsculas: "a-77" já está na caixa 20 (D26)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.joao, '/servicos/novo')
    const where = `A OS a-77 já está na caixa 20 (Preta), aberta desde ${dayMonth(addDays(lab.today, -1))}.`
    await pickFreeBox(page, '61')
    await newMovement.client(page).fill('Ótica Minúscula')
    await newMovement.orderService(page).fill('a-77')
    await expect(page.getByText(`${where} Você pode lançar mesmo assim.`)).toBeVisible()
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, `Lançado na caixa 61: Ótica Minúscula. ${where}`)).toBeVisible()
  })

  test('sugere os clientes já usados, com teclado e com toque (D24)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const options = page.getByRole('listbox', { name: 'Clientes já usados' }).getByRole('option')

    // Sem acento e em minúsculas; setas e Enter escolhem e vão para a OS.
    await pickFreeBox(page, '1')
    await newMovement.client(page).pressSequentially('otica vis')
    await expect(options).toHaveText(['Ótica Visão Clara'])
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(newMovement.client(page)).toHaveValue('Ótica Visão Clara')
    await expect(newMovement.orderService(page)).toBeFocused()
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 1: Ótica Visão Clara.')).toBeVisible()

    // O mais usado vem primeiro; um toque escolhe.
    await pickFreeBox(page, '7')
    await newMovement.client(page).pressSequentially('ótica')
    await expect(options.first()).toHaveText('Ótica Visão Clara')
    await options.filter({ hasText: 'Ótica Íris' }).click()
    await expect(newMovement.client(page)).toHaveValue('Ótica Íris')
    await expect(newMovement.orderService(page)).toBeFocused()

    // Um nome novo também vale.
    await newMovement.client(page).fill('Ótica Que Ainda Não Existe')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica Que Ainda Não Existe.')).toBeVisible()
  })

  test('"Desfazer" do aviso tira o lançamento e libera a caixa', async ({ openAs, apiAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await pickFreeBox(page, '1')
    await newMovement.client(page).fill('Ótica Engano')
    await newMovement.saveAndNext(page).click()
    await notice(page, 'Lançado na caixa 1: Ótica Engano.').getByRole('button', { name: 'Desfazer' }).click()
    await expect(notice(page, 'Lançamento desfeito. A caixa 1 está livre de novo.')).toBeVisible()
    expect(await (await apiAs(lab.users.joao)).boxState('1')).toBe('free')

    await goTo(page, 'Hoje')
    await expect(page.getByText('Nenhum serviço lançado hoje')).toBeVisible()
  })

  // F7-1: no computador, o aviso cobria metade do botão. 1366×625 é um notebook comum com o navegador aberto.
  for (const size of [null, { width: 1366, height: 625 }]) {
    const where = size ? `em ${size.width}×${size.height}` : 'no tamanho do projeto'
    test(`os avisos não cobrem "Salvar e próximo" nem "Concluir", ${where}`, async ({ openAs, apiAs, lab }) => {
      const page = await openAs(lab.users.ana, '/servicos/novo')
      if (size) await page.setViewportSize(size)
      await pickFreeBox(page, '1')
      await newMovement.client(page).fill('Ótica do Aviso')
      await newMovement.saveAndNext(page).click()
      const launched = notice(page, 'Lançado na caixa 1: Ótica do Aviso.')
      await expectNotCovered(page, launched)

      // O aviso de erro é mais alto e não some sozinho.
      const joao = await apiAs(lab.users.joao)
      await page.route('**/api/movements', async (route) => {
        if (isLaunch(route.request())) await joao.launch('7', 'Ótica do João')
        await route.continue()
      })
      await pickFreeBox(page, '7')
      await newMovement.client(page).fill('Ótica Recusada')
      await newMovement.saveAndNext(page).click()
      const refused = notice(page, 'Caixa 7 (Ótica Recusada) não foi lançada.')
      await expectNotCovered(page, refused)
    })
  }

  test('caixa e cliente são obrigatórios; caixa inexistente avisa', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await newMovement.box(page).fill('999')
    await expect(page.getByText('Não existe caixa 999. Confira o número na etiqueta.')).toBeVisible()
    await pickFreeBox(page, '1')
    await newMovement.saveAndNext(page).click()
    await expect(page.getByText('Informe o cliente.')).toBeVisible()
    await expect(newMovement.client(page)).toBeFocused()
  })

  test('os campos pedem o teclado certo no celular (R2, D23)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const { box, client, orderService, note } = newMovement
    await expect(box(page)).toHaveAttribute('inputmode', 'numeric')
    await expect(box(page)).toHaveAttribute('pattern', '[0-9]*')
    await expect(box(page)).toHaveAttribute('enterkeyhint', 'next')
    await expect(box(page)).toHaveAttribute('autocomplete', 'off')
    await expect(box(page)).toHaveAttribute('maxlength', '6')
    await expect(client(page)).toHaveAttribute('enterkeyhint', 'next')
    await expect(client(page)).toHaveAttribute('autocapitalize', 'words')
    await expect(client(page)).toHaveAttribute('autocomplete', 'off')
    // A OS pode ter letras: sem teclado numérico (D23).
    await expect(orderService(page)).not.toHaveAttribute('inputmode', /.*/)
    await expect(orderService(page)).toHaveAttribute('enterkeyhint', 'next')
    await expect(note(page)).toHaveAttribute('enterkeyhint', 'send')

    for (const field of [box(page), client(page), orderService(page), note(page)]) {
      // Abaixo de 16 px o iPhone dá zoom ao focar; o alvo de toque é de 44 px ou mais.
      const fontSize = await field.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      expect(fontSize).toBeGreaterThanOrEqual(16)
      expect((await field.boundingBox())?.height).toBeGreaterThanOrEqual(44)
    }
    // Só dígitos entram no número da caixa.
    await box(page).pressSequentially('1a-2')
    await expect(box(page)).toHaveValue('12')
  })
})
