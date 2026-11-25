import { expect, type Locator, type Page } from '@playwright/test'
import type { LabUser } from './lab'

/** Atalhos da interface, sempre por papel e rótulo acessível. */

const IN_MORE = ['Baixas', 'Folhas', 'Caixas', 'Usuários', 'Minha conta']

export type Screen = 'Hoje' | 'Conferência' | 'Buscar' | 'Baixas' | 'Folhas' | 'Caixas' | 'Usuários' | 'Minha conta'

export function mainNav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Navegação principal' })
}

/** Navega como a pessoa: barra inferior e "Mais" no celular, barra lateral no computador. */
export async function goTo(page: Page, screen: Screen): Promise<void> {
  const nav = mainNav(page)
  await expect(nav).toBeVisible()
  const more = nav.getByRole('link', { name: 'Mais', exact: true })
  if (IN_MORE.includes(screen) && (await more.isVisible())) {
    await more.click()
    await page.getByRole('navigation', { name: 'Mais opções' }).getByRole('link', { name: screen }).click()
  } else {
    await nav.getByRole('link', { name: screen }).click()
  }
  await expectScreen(page, screen)
}

export async function expectScreen(page: Page, title: string): Promise<void> {
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
}

export async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  await page.getByLabel('Usuário').fill(username)
  await page.getByRole('textbox', { name: 'Senha' }).fill(password)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

export async function loginInForm(page: Page, user: LabUser): Promise<void> {
  await fillLogin(page, user.username, user.password)
  await expect(page.getByTestId('current-user')).toHaveText(user.name)
}

/** Um aviso (toast) com esse texto. */
export function notice(page: Page, text: string | RegExp): Locator {
  return page.getByRole('region', { name: 'Avisos' }).locator('[role=status], [role=alert]').filter({ hasText: text })
}

/** A linha de um serviço na Conferência. */
export function reviewRow(page: Page, boxNumber: string, clientName: string): Locator {
  return page.getByRole('listitem').filter({
    has: page.getByRole('link', { name: `${clientName}, caixa ${boxNumber}: ver detalhe`, exact: true }),
  })
}

export function reviewRows(page: Page): Locator {
  return page.getByRole('link', { name: /, caixa \d+: ver detalhe$/ })
}

export const newMovement = {
  toFix: (page: Page) => page.getByRole('region', { name: 'Lançamentos para corrigir' }),
  box: (page: Page) => page.getByLabel('Caixa', { exact: true }),
  client: (page: Page) => page.getByRole('combobox', { name: 'Cliente' }),
  orderService: (page: Page) => page.getByLabel('OS (opcional)'),
  note: (page: Page) => page.getByLabel('Observação (opcional)'),
  saveAndNext: (page: Page) => page.getByRole('button', { name: 'Salvar e próximo' }),
  finish: (page: Page) => page.getByRole('button', { name: 'Concluir' }),
}

/** Digita o número e espera a caixa aparecer como livre e escolhida. */
export async function pickFreeBox(page: Page, boxNumber: string): Promise<void> {
  await newMovement.box(page).fill(boxNumber)
  await expect(page.getByRole('button', { name: new RegExp(`^Caixa ${boxNumber}, .*Livre`) })).toBeVisible()
}
