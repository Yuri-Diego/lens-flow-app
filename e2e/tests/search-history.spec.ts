import type { Page } from '@playwright/test'
import { expectScreen, goTo, notice, reviewRow } from '../support/app'
import { expect, test } from '../support/test'

const results = (page: Page) => page.getByRole('list', { name: 'Resultados' }).getByRole('listitem')

test.describe('Buscar', () => {
  test('acha por cliente, OS e número da caixa, em qualquer dia e situação', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana)
    await goTo(page, 'Buscar')
    const search = page.getByRole('searchbox')
    await expect(search).toBeFocused()

    // Cliente: sem acento, em minúsculas e pelo meio do nome.
    await search.fill('sao joao')
    await expect(results(page)).toHaveCount(1)
    await expect(results(page)).toContainText('Ótica São João')
    await expect(results(page)).toContainText('Lançado por Ana Souza')

    // OS: exata, por prefixo e com letras (D23).
    await search.fill('4521')
    await expect(results(page)).toContainText(['Ótica Central'])
    await expect(results(page)).toHaveCount(1)
    await search.fill('45')
    await expect(results(page)).toHaveCount(2)
    await search.fill('A-7')
    await expect(results(page)).toContainText(['Óticas Primavera'])
    await expect(results(page)).toHaveCount(1)

    // Caixa: número exato. "2" não traz a 20 nem a 21.
    await search.fill('2')
    await expect(results(page)).toHaveCount(1)
    await expect(results(page)).toContainText('Ótica Central')

    // O que já saiu também aparece, dizendo onde está.
    await search.fill('cristal')
    await expect(results(page)).toContainText(['Saiu · falta liberar a caixa'])

    // Texto literal: nada vira expressão regular.
    await search.fill('ótica (.*')
    await expect(page.getByText('Nada encontrado')).toBeVisible()

    await search.fill('central')
    await results(page).getByRole('link').click()
    await expectScreen(page, 'Ótica Central')
    await expect(page).toHaveURL(new RegExp(`/servicos/${lab.movements['2']}$`))
  })
})

test.describe('OS sem distinguir maiúsculas (D26)', () => {
  for (const term of ['a-7', 'a-77']) {
    test(`"${term}" acha só a OS A-77, como foi digitada`, async ({ openAs, lab }) => {
      const page = await openAs(lab.users.ana, `/buscar?q=${term}`)
      await expect(results(page)).toHaveCount(1)
      await expect(results(page)).toContainText('Óticas Primavera')
      await expect(results(page)).toContainText('OS A-77')
    })
  }

  test('mudar só as maiúsculas da própria OS grava e não avisa repetição', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.admin, `/servicos/${lab.movements['20']}`)
    await page.getByRole('button', { name: 'Editar' }).click()
    const form = page.getByRole('form', { name: 'Editar serviço' })
    await expect(form.getByLabel('OS (opcional)')).toHaveValue('A-77')
    await form.getByLabel('OS (opcional)').fill('a-77')
    const response = page.waitForResponse((res) => res.request().method() === 'PATCH')
    await form.getByRole('button', { name: 'Salvar' }).click()
    expect((await (await response).json()).warnings).toEqual([])
    await expect(notice(page, /^Serviço atualizado\.$/)).toBeVisible()
    await expect(page.getByRole('main').getByText('a-77', { exact: true })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Linha do tempo' })).toContainText('Editado por Adriana Admin (OS)')
  })
})

test.describe('Histórico', () => {
  test('a linha do tempo mostra quem fez o quê (RN-02)', async ({ openAs, lab }) => {
    const id = lab.movements['2']
    const page = await openAs(lab.users.joao, '/conferencia')

    // João troca a caixa e dá baixa; a Adriana (admin) desfaz, edita e conclui.
    await page.getByRole('button', { name: 'Trocar caixa de Ótica Central' }).click()
    await page.getByLabel('Caixa nova').fill('1')
    await page.getByRole('button', { name: 'Trocar para a caixa 1' }).click()
    await expect(notice(page, 'Caixa trocada')).toBeVisible()
    await reviewRow(page, '1', 'Ótica Central').getByRole('checkbox', { name: 'Saiu' }).click()
    await expect(notice(page, 'Baixa dada')).toBeVisible()

    await openAs(lab.users.admin, `/servicos/${id}`)
    await page.getByRole('button', { name: 'Desfazer baixa' }).click()
    await expect(notice(page, 'Baixa desfeita')).toBeVisible()
    await page.getByRole('button', { name: 'Editar' }).click()
    const form = page.getByRole('form', { name: 'Editar serviço' })
    await form.getByRole('combobox', { name: 'Cliente' }).fill('Ótica Central Matriz')
    await form.getByLabel('OS (opcional)').fill('4521-B')
    await form.getByRole('button', { name: 'Salvar' }).click()
    await expect(notice(page, 'Serviço atualizado.')).toBeVisible()
    await page.getByRole('button', { name: 'Saiu e liberar' }).click()
    await expect(notice(page, 'Saiu e caixa liberada')).toBeVisible()

    const timeline = page.getByRole('list', { name: 'Linha do tempo' }).getByRole('listitem')
    const expected = [
      'Lançado por Ana Souza na caixa 2',
      'Caixa trocada por João Lima: da 2 para a 1',
      'Baixa por João Lima',
      'Baixa desfeita por Adriana Admin',
      'Editado por Adriana Admin (cliente, OS)',
      'Baixa por Adriana Admin',
      'Caixa liberada por Adriana Admin',
    ]
    await expect(timeline).toHaveCount(expected.length)
    await expect(timeline).toContainText(expected)
    // Cada evento tem data e hora.
    for (let index = 0; index < expected.length; index += 1) {
      await expect(timeline.nth(index)).toContainText(/\d{2}\/\d{2} \d{2}:\d{2}/)
    }
  })

  test('o serviço excluído some das telas e continua no histórico geral do admin', async ({ openAs, apiAs, lab }) => {
    const ana = await apiAs(lab.users.ana)
    const { id } = await ana.launch('1', 'Ótica Excluída')
    const page = await openAs(lab.users.ana, '/hoje')
    await page.getByRole('link', { name: /Ótica Excluída/ }).click()
    await page.getByRole('button', { name: 'Excluir' }).click()
    await page.getByRole('dialog', { name: 'Excluir lançamento?' }).getByRole('button', { name: 'Excluir' }).click()
    await expect(notice(page, 'Lançamento excluído. A caixa 1 ficou livre.')).toBeVisible()
    await page.goto(`/servicos/${id}`)
    await expect(page.getByText('Serviço não encontrado')).toBeVisible()
    expect(await ana.boxState('1')).toBe('free')

    const admin = await apiAs(lab.users.admin)
    const audit = await (await admin.request.get(`/api/audit?entityId=${id}`)).json()
    expect(audit.items.map((item: { action: string }) => item.action)).toEqual(['movement.delete', 'movement.create'])
    expect(audit.items[0].user.name).toBe('Ana Souza')
  })
})
