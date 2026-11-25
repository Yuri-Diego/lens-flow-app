import type { Page } from '@playwright/test'
import { expectScreen, goTo, newMovement, notice, pickFreeBox, reviewRow, reviewRows } from '../support/app'
import { addDays, dayMonth, localInstant } from '../support/lab'
import { expect, test } from '../support/test'

const todayList = (page: Page) => page.getByRole('list', { name: 'Serviços de hoje' })

test.describe('O dia do laboratório', () => {
  test('fluxo completo: entrar, lançar, conferir, liberar, reutilizar a caixa e ver as baixas', async ({ page, lab }) => {
    await page.goto('/')
    await page.getByLabel('Usuário').fill(lab.users.joao.username)
    await page.getByRole('textbox', { name: 'Senha' }).fill(lab.users.joao.password)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expectScreen(page, 'Hoje')
    await expect(page.getByRole('link', { name: 'De dias anteriores 7' })).toBeVisible()

    // Lança.
    await page.getByRole('link', { name: 'Novo serviço', exact: true }).click()
    await pickFreeBox(page, '1')
    await newMovement.client(page).fill('Ótica do Dia')
    await newMovement.finish(page).click()
    await expect(todayList(page)).toContainText('Ótica do Dia')

    // Confere um de ontem, em um toque.
    await goTo(page, 'Conferência')
    await expect(reviewRows(page)).toHaveCount(8)
    await reviewRow(page, '30', 'Ótica Visão Clara').getByRole('button', { name: 'Saiu e liberar' }).click()
    await expect(notice(page, 'Saiu e caixa liberada: caixa 30')).toBeVisible()
    await expect(reviewRows(page)).toHaveCount(7)

    // A caixa 30 volta a receber serviço.
    await goTo(page, 'Hoje')
    await page.getByRole('link', { name: 'Novo serviço', exact: true }).click()
    await pickFreeBox(page, '30')
    await newMovement.client(page).fill('Ótica Reaproveita')
    await newMovement.finish(page).click()
    await expect(todayList(page).getByRole('listitem')).toHaveCount(2)

    // Baixas: quem deu baixa, e a baixa de ontem separada por dia.
    await goTo(page, 'Baixas')
    const today = page.getByRole('region', { name: `Baixas de ${dayMonth(lab.today)}` })
    await expect(today).toContainText('Ótica Visão Clara')
    await expect(today).toContainText('Baixa por João Lima')
    const yesterday = page.getByRole('region', { name: `Baixas de ${dayMonth(addDays(lab.today, -1))}` })
    await expect(yesterday).toContainText('Ótica Cristal')
    await page.getByLabel('Quem deu baixa').selectOption({ label: 'Ana Souza' })
    await expect(page.getByText('Nenhuma baixa')).toBeVisible()

    // Folhas: os dias com os contadores.
    await goTo(page, 'Folhas')
    await page.getByRole('link', { name: new RegExp(dayMonth(addDays(lab.today, -1))) }).click()
    await expect(page.getByText('6 lançados · 2 saíram · 4 abertos', { exact: false })).toBeVisible()
  })

  test('perto da meia-noite: o dia é o do servidor, não o do aparelho (RN-06)', async ({ openAs, lab, setServerNow }) => {
    const tomorrow = addDays(lab.today, 1)
    await setServerNow(localInstant(lab.today, '23:58'))
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await expect(page.getByText(`Na folha de hoje, ${dayMonth(lab.today)}.`)).toBeVisible()
    await pickFreeBox(page, '1')
    await newMovement.client(page).fill('Ótica da Meia-Noite')
    await newMovement.finish(page).click()
    await expect(todayList(page)).toContainText('Ótica da Meia-Noite')

    // Quatro minutos depois, a folha de hoje é outra e o serviço virou "de ontem".
    await setServerNow(localInstant(tomorrow, '00:02'))
    await page.reload()
    await expect(page.getByText(dayMonth(tomorrow), { exact: false }).first()).toBeVisible()
    await expect(page.getByText('Nenhum serviço lançado hoje')).toBeVisible()

    await goTo(page, 'Conferência')
    const sheet = page.getByRole('region', { name: `Folha de ${dayMonth(lab.today)}` })
    await expect(sheet.getByRole('heading')).toContainText('Ontem')
    await expect(sheet).toContainText('Ótica da Meia-Noite')
    await expect(sheet).toContainText('1 dia em aberto')

    // E já não é mais lançamento do dia: a própria Ana não edita (RN-11).
    await sheet.getByRole('link', { name: /^Ótica da Meia-Noite/ }).click()
    await expectScreen(page, 'Ótica da Meia-Noite')
    await expect(page.getByRole('button', { name: 'Trocar caixa' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Editar' })).toBeHidden()

    // Um lançamento novo entra na folha nova.
    await page.goto('/servicos/novo')
    await expect(page.getByText(`Na folha de hoje, ${dayMonth(tomorrow)}.`)).toBeVisible()
    await pickFreeBox(page, '7')
    await newMovement.client(page).fill('Ótica da Madrugada')
    await newMovement.finish(page).click()
    await expect(todayList(page).getByRole('listitem')).toHaveCount(1)
  })
})
