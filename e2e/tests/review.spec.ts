import type { Page } from '@playwright/test'
import { expectScreen, goTo, mainNav, newMovement, notice, pickFreeBox, reviewRow, reviewRows } from '../support/app'
import { expectApiError } from '../support/api'
import { addDays, dayMonth } from '../support/lab'
import { expect, test } from '../support/test'

const selectBox = (page: Page, number: string, client: string) =>
  page.getByRole('checkbox', { name: `Selecionar caixa ${number}, ${client}` })

test.describe('Conferência', () => {
  test('mostra os pendentes por folha, com os urgentes no topo e o nível de atraso (D15, D22)', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.joao, '/conferencia')
    const yesterday = dayMonth(addDays(lab.today, -1))
    await expect(page.getByText('7 pendentes · 1 atrasado · 2 em atenção')).toBeVisible()
    // F7-3: o leitor de tela ouve no singular.
    await expect(mainNav(page).getByRole('link', { name: /7 pendentes, 1 atrasado(?!s)/ })).toBeVisible()

    // A vermelha de ontem sobe um nível e vem antes de tudo, com a folha dela.
    const urgent = page.getByRole('region', { name: 'Urgentes' })
    await expect(reviewRows(page).first()).toHaveAccessibleName('Ótica Bela Vista, caixa 50: ver detalhe')
    await expect(urgent.getByRole('listitem')).toHaveCount(1)
    await expect(urgent).toContainText('Atenção')
    await expect(urgent).toContainText(`folha de ${yesterday}`)

    const sheet = (daysAgo: number) => page.getByRole('region', { name: `Folha de ${dayMonth(addDays(lab.today, -daysAgo))}` })
    await expect(sheet(3)).toContainText('Ótica Popular')
    await expect(sheet(3)).toContainText('Atrasado')
    await expect(sheet(3)).toContainText('3 dias em aberto')
    await expect(sheet(2)).toContainText('Atenção')
    await expect(sheet(1).getByRole('heading')).toContainText(`Ontem · ${yesterday}`)
    await expect(sheet(1)).toContainText('Normal')
    // Dentro da folha, na ordem natural do número: 2, 10, 20, 30.
    const numbers = sheet(1).getByRole('link', { name: /ver detalhe$/ })
    await expect(numbers).toHaveCount(4)
    for (const [index, number] of ['2', '10', '20', '30'].entries()) {
      await expect(numbers.nth(index)).toHaveAccessibleName(new RegExp(`, caixa ${number}:`))
    }

    // Filtro e ordem da prateleira.
    await page.getByLabel('Filtrar por categoria ou cor').selectOption({ label: 'Com montagem' })
    await expect(reviewRows(page)).toHaveCount(2)
    await page.getByLabel('Filtrar por categoria ou cor').selectOption('')
    await page.getByLabel('Ordenar por').selectOption({ label: 'Número da caixa' })
    await expect(page.getByRole('list', { name: 'Pela prateleira' }).getByRole('listitem').first()).toContainText('Ótica Central')
  })

  test('dá baixa e depois libera: liberar só depois de Saiu (D6)', async ({ openAs, apiAs, lab }) => {
    const api = await apiAs(lab.users.ana)
    const page = await openAs(lab.users.joao, '/conferencia')
    const row = reviewRow(page, '2', 'Ótica Central')
    const out = row.getByRole('checkbox', { name: 'Saiu' })
    const release = row.getByRole('checkbox', { name: 'Liberar caixa' })
    await expect(release).toBeDisabled()
    await expect(row).toContainText('dê baixa antes')

    await out.click()
    await expect(notice(page, 'Baixa dada: caixa 2 · Ótica Central.')).toBeVisible()
    await expect(out).toBeChecked()
    await expect(row).toContainText(/Saiu às \d{2}:\d{2} por João Lima/)
    expect(await api.boxState('2')).toBe('occupied')

    await expect(release).toBeEnabled()
    await release.click()
    await expect(notice(page, 'Caixa liberada: caixa 2 · Ótica Central.')).toBeVisible()
    await expect(row).toBeHidden()
    expect(await api.boxState('2')).toBe('free')

    // A API também recusa liberar antes da baixa.
    const refused = await api.request.post(`/api/movements/${lab.movements['10']}/release-box`)
    await expectApiError(refused, 409, 'CONFLICT')
  })

  test('"Saiu e liberar" em um toque, e "Desfazer" traz de volta', async ({ openAs, apiAs, lab }) => {
    const api = await apiAs(lab.users.ana)
    const page = await openAs(lab.users.joao, '/conferencia')
    const row = reviewRow(page, '10', 'Ótica São João')
    await row.getByRole('button', { name: 'Saiu e liberar' }).click()
    const done = notice(page, 'Saiu e caixa liberada: caixa 10 · Ótica São João.')
    await expect(done).toBeVisible()
    await expect(row).toBeHidden()
    expect(await api.boxState('10')).toBe('free')

    await done.getByRole('button', { name: 'Desfazer' }).click()
    await expect(row).toBeVisible()
    await expect(row.getByRole('checkbox', { name: 'Saiu' })).not.toBeChecked()
    expect(await api.boxState('10')).toBe('occupied')
    expect((await api.movement(lab.movements['10'])).status).toBe('open')
  })

  test('o check "Saiu" desmarca a própria baixa', async ({ openAs, apiAs, lab }) => {
    const api = await apiAs(lab.users.ana)
    const page = await openAs(lab.users.joao, '/conferencia')
    const out = reviewRow(page, '20', 'Óticas Primavera').getByRole('checkbox', { name: 'Saiu' })
    await out.click()
    await expect(notice(page, 'Baixa dada: caixa 20')).toBeVisible()
    await out.click()
    await expect(notice(page, 'Baixa desfeita: caixa 20 · Óticas Primavera.')).toBeVisible()
    await expect(out).not.toBeChecked()
    expect((await api.movement(lab.movements['20'])).status).toBe('open')
  })

  test('lote: baixa e liberação de vários, e "Desfazer lote" (D9)', async ({ openAs, apiAs, lab }) => {
    const api = await apiAs(lab.users.ana)
    const page = await openAs(lab.users.joao, '/conferencia')
    await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
    await selectBox(page, '2', 'Ótica Central').click()
    await selectBox(page, '10', 'Ótica São João').click()
    await selectBox(page, '50', 'Ótica Bela Vista').click()
    await expect(page.getByRole('button', { name: 'Dar baixa (3)' })).toBeEnabled()
    await page.getByRole('button', { name: 'Dar baixa e liberar (3)' }).click()

    const done = notice(page, 'Baixa e liberação de 3 serviços.')
    await expect(done).toBeVisible()
    await expect(reviewRows(page)).toHaveCount(4)
    await expect(page.getByText('4 pendentes · 1 atrasado · 1 em atenção')).toBeVisible()
    expect(await api.boxState('50')).toBe('free')

    await done.getByRole('button', { name: 'Desfazer lote' }).click()
    await expect(notice(page, 'Lote desfeito: 3 serviços voltaram para a Conferência.')).toBeVisible()
    await expect(reviewRows(page)).toHaveCount(7)
    for (const number of ['2', '10', '50']) {
      expect(await api.boxState(number)).toBe('occupied')
      expect((await api.movement(lab.movements[number])).status).toBe('open')
    }
  })

  test('lote com falha: diz o que deu certo e o que não deu, e desfaz só o que fez', async ({ openAs, apiAs, lab }) => {
    const ana = await apiAs(lab.users.ana)
    const page = await openAs(lab.users.joao, '/conferencia')
    await expect(reviewRows(page)).toHaveCount(7)
    // Ana termina o serviço da caixa 10 enquanto João ainda o vê como pendente.
    await ana.checkout(lab.movements['10'])
    await ana.release(lab.movements['10'])

    await page.getByRole('button', { name: 'Selecionar', exact: true }).click()
    await selectBox(page, '2', 'Ótica Central').click()
    await selectBox(page, '10', 'Ótica São João').click()
    await page.getByRole('button', { name: 'Dar baixa e liberar (2)' }).click()

    const result = page.getByRole('alert').filter({ hasText: '1 serviço não foi alterado' })
    await expect(result).toContainText('Caixa 10 · Ótica São João: Esse serviço já saiu e a caixa já foi liberada.')
    await expect(selectBox(page, '10', 'Ótica São João')).toBeChecked()
    await expect(selectBox(page, '2', 'Ótica Central')).toBeHidden()
    expect(await ana.boxState('2')).toBe('free')

    await notice(page, 'Baixa e liberação de 1 serviço de 2. 1 falhou.').getByRole('button', { name: 'Desfazer lote' }).click()
    await expect(notice(page, 'Lote desfeito: 1 serviço voltou para a Conferência.')).toBeVisible()
    expect(await ana.boxState('2')).toBe('occupied')
    // O que Ana fez continua feito.
    expect(await ana.boxState('10')).toBe('free')
    expect((await ana.movement(lab.movements['10'])).status).toBe('out')
  })

  test('"Falta liberar": libera a caixa de quem já saiu (R15)', async ({ openAs, apiAs, lab }) => {
    const page = await openAs(lab.users.ana)
    await page.getByRole('link', { name: '1 serviço saiu e falta liberar a caixa' }).click()
    await expectScreen(page, 'Conferência')
    await expect(page.getByRole('tab', { name: 'Falta liberar (1)' })).toHaveAttribute('aria-selected', 'true')
    const row = reviewRow(page, '21', 'Ótica Cristal')
    await row.getByRole('button', { name: 'Liberar', exact: true }).click()
    await expect(notice(page, 'Caixa liberada: caixa 21 · Ótica Cristal.')).toBeVisible()
    await expect(page.getByText('Nenhuma caixa para liberar')).toBeVisible()
    expect(await (await apiAs(lab.users.joao)).boxState('21')).toBe('free')
  })

  test('a caixa liberada é reutilizada, e a liberação antiga não se desfaz mais', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.joao, '/conferencia')
    await reviewRow(page, '2', 'Ótica Central').getByRole('button', { name: 'Saiu e liberar' }).click()
    await expect(notice(page, 'Saiu e caixa liberada: caixa 2')).toBeVisible()

    await goTo(page, 'Hoje')
    await page.getByRole('link', { name: 'Novo serviço', exact: true }).click()
    await pickFreeBox(page, '2')
    await newMovement.client(page).fill('Ótica Nova na Dois')
    await newMovement.finish(page).click()
    await expect(page.getByRole('list', { name: 'Serviços de hoje' })).toContainText('Ótica Nova na Dois')

    await page.goto(`/servicos/${lab.movements['2']}`)
    await page.getByRole('button', { name: /^Desfazer liberação/ }).click()
    await expect(
      notice(page, 'Não foi possível desfazer. A caixa 2 já recebeu outro serviço. Não dá para desfazer a liberação.'),
    ).toBeVisible()
  })

  test('qualquer operador troca a caixa de um serviço de outro dia (D19)', async ({ openAs, apiAs, lab }) => {
    const api = await apiAs(lab.users.ana)
    // Caixa 2: lançada ontem pela Ana. Quem troca é o João.
    const page = await openAs(lab.users.joao, '/conferencia')
    await page.getByRole('button', { name: 'Trocar caixa de Ótica Central' }).click()
    const dialog = page.getByRole('dialog', { name: 'Trocar caixa' })
    await expect(dialog.getByLabel('Caixa nova')).toBeFocused()

    await dialog.getByLabel('Caixa nova').fill('10')
    await expect(dialog.getByText('Ocupada por Ótica São João', { exact: false })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Trocar caixa' })).toBeDisabled()
    await dialog.getByLabel('Caixa nova').fill('52')
    await dialog.getByRole('button', { name: 'Trocar para a caixa 52' }).click()

    await expect(notice(page, 'Caixa trocada: Ótica Central saiu da caixa 2 e foi para a 52.')).toBeVisible()
    await expect(reviewRow(page, '52', 'Ótica Central')).toBeVisible()
    expect(await api.boxState('2')).toBe('free')
    expect(await api.boxState('52')).toBe('occupied')
    // Continua na folha do lançamento.
    expect((await api.movement(lab.movements['2'])).sheetDate).toBe(addDays(lab.today, -1))
  })

  test('o desfazer tem contagem regressiva de 10 min para o operador e não tem prazo para o admin (RN-11)', async ({
    openAs,
    apiAs,
    lab,
    setServerNow,
  }) => {
    const joao = await apiAs(lab.users.joao)
    await joao.checkout(lab.movements['2'])
    const detail = `/servicos/${lab.movements['2']}`

    const page = await openAs(lab.users.joao, detail)
    const undo = page.getByRole('button', { name: /^Desfazer baixa \(\d+:\d{2}\)$/ })
    await expect(undo).toHaveText(/\(9:\d{2}\)/)
    const first = await undo.innerText()
    await expect(undo).not.toHaveText(first)

    // 11 minutos depois: a tela não oferece mais, e a API recusa.
    const late = new Date(Date.now() + 11 * 60_000).toISOString()
    await setServerNow(late)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Liberar caixa' })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Desfazer baixa/ })).toBeHidden()
    const refused = await joao.request.post(`/api/movements/${lab.movements['2']}/undo`, {
      data: { action: 'checkout' },
      headers: { 'X-E2E-Now': late },
    })
    await expectApiError(refused, 403, 'FORBIDDEN')

    await openAs(lab.users.admin, detail)
    await page.getByRole('button', { name: 'Desfazer baixa', exact: true }).click()
    await expect(notice(page, 'Baixa desfeita: caixa 2 · Ótica Central.')).toBeVisible()
  })
})
