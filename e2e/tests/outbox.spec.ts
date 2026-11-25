import type { Page, Request } from '@playwright/test'
import { expectScreen, goTo, loginInForm, newMovement, notice, pickFreeBox } from '../support/app'
import { expect, test } from '../support/test'

/**
 * O lançamento entre o toque em "Salvar e próximo" e a confirmação: não se
 * perde, não entra duas vezes e nunca sai em nome de outra pessoa.
 */

const isLaunch = (request: Request) => request.method() === 'POST' && new URL(request.url()).pathname === '/api/movements'

const isBoxLookup = (request: Request) => {
  const url = new URL(request.url())
  return request.method() === 'GET' && url.pathname === '/api/boxes' && url.searchParams.has('number')
}

/**
 * Segura no caminho as respostas dos pedidos que casam. O pedido chega à API na
 * hora, com a sessão de quem o fez, como numa rede lenta: segurar o pedido, e
 * não a resposta, o faria sair com o cookie de quem entrou depois.
 */
async function holdResponses(page: Page, matches: (request: Request) => boolean, beforeSend?: () => Promise<unknown>) {
  let open: () => void = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  const requests: Request[] = []
  let answered = 0
  let released = false

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    if (!matches(request) || released) return route.fallback()
    requests.push(request)
    await beforeSend?.()
    const response = await route.fetch()
    answered += 1
    await gate
    // Recarregou ou cancelou: já não há quem espere a resposta.
    await route.fulfill({ response }).catch(() => {})
  })

  return {
    requests,
    /** Espera a API responder a pelo menos um pedido, com a resposta ainda presa. */
    waitAnswered: () => expect.poll(() => answered).toBeGreaterThan(0),
    release: () => {
      released = true
      open()
    },
  }
}

/** Todos os lançamentos que saíram do navegador. */
function recordLaunches(page: Page): Request[] {
  const launches: Request[] = []
  page.on('request', (request) => {
    if (isLaunch(request)) launches.push(request)
  })
  return launches
}

async function fillLaunch(page: Page, boxNumber: string, clientName: string) {
  await pickFreeBox(page, boxNumber)
  await newMovement.client(page).fill(clientName)
  await newMovement.orderService(page).fill('B-900')
  await newMovement.note(page).fill('com todos os campos')
}

async function expectForm(page: Page, boxNumber: string, clientName: string) {
  await expect(newMovement.box(page)).toHaveValue(boxNumber)
  await expect(newMovement.client(page)).toHaveValue(clientName)
  await expect(newMovement.orderService(page)).toHaveValue('B-900')
  await expect(newMovement.note(page)).toHaveValue('com todos os campos')
}

const header = (page: Page, name: 'Sair' | 'Trocar usuário') => page.getByRole('banner').getByRole('button', { name })
const failed = (page: Page, text: string) => notice(page, text)
const sending = (page: Page) => page.getByText('Enviando 1 lançamento…')
const correct = (page: Page) => newMovement.toFix(page).getByRole('button', { name: 'Corrigir' })

async function switchTo(page: Page, user: Parameters<typeof loginInForm>[1]) {
  await header(page, 'Trocar usuário').click()
  await expect(page.getByRole('heading', { name: 'Trocar usuário' })).toBeVisible()
  await loginInForm(page, user)
}

async function openNewMovement(page: Page) {
  await page.getByRole('link', { name: 'Novo serviço', exact: true }).click()
  await expectScreen(page, 'Novo serviço')
}

test.describe('Lançamento em envio', () => {
  test('falha depois de sair da tela: avisa e volta para corrigir com tudo o que foi digitado', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const hold = await holdResponses(page, isLaunch, () => joao.launch('1', 'Ótica do João'))
    await fillLaunch(page, '1', 'Ótica que Falha')
    await newMovement.saveAndNext(page).click()
    await hold.waitAnswered()
    await expect(sending(page)).toBeVisible()

    await goTo(page, 'Hoje')
    await expect(failed(page, 'Ótica que Falha')).toBeHidden()
    hold.release()
    await expect(failed(page, 'Caixa 1 (Ótica que Falha) não foi lançada. A caixa 1 já está ocupada')).toBeVisible()

    await openNewMovement(page)
    await expect(newMovement.toFix(page)).toContainText('Caixa 1 · Ótica que Falha: não foi lançada')
    await correct(page).click()
    await expectForm(page, '1', 'Ótica que Falha')
    await expect(failed(page, 'Ótica que Falha')).toBeHidden()
    await pickFreeBox(page, '7')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica que Falha.')).toBeVisible()
    await expect(newMovement.toFix(page)).toBeHidden()
    expect(await joao.openMovementsOf('Ótica que Falha')).toHaveLength(1)
  })

  test('falha depois de "Trocar usuário": nada aparece para o seguinte, e quem volta reencontra', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const hold = await holdResponses(page, isLaunch, () => joao.launch('1', 'Ótica do João'))
    await fillLaunch(page, '1', 'Ótica da Ana')
    await newMovement.saveAndNext(page).click()
    await hold.waitAnswered()

    await switchTo(page, lab.users.joao)
    await expectScreen(page, 'Novo serviço')
    const answer = page.waitForEvent('requestfinished', (request) => request === hold.requests[0])
    hold.release()
    await answer

    // O lançamento seguinte, do João, entra normalmente. Até lá, nada da Ana apareceu.
    await expect(newMovement.box(page)).toHaveValue('')
    await pickFreeBox(page, '7')
    await newMovement.client(page).fill('Ótica Seguinte')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica Seguinte.')).toBeVisible()
    await expect(page.getByText('Ótica da Ana')).toHaveCount(0)
    await expect(newMovement.toFix(page)).toBeHidden()
    await expect(sending(page)).toBeHidden()

    await switchTo(page, lab.users.ana)
    await expect(newMovement.toFix(page)).toContainText('Caixa 1 · Ótica da Ana: não foi lançada')
    await correct(page).click()
    await expectForm(page, '1', 'Ótica da Ana')
    await pickFreeBox(page, '31')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 31: Ótica da Ana.')).toBeVisible()
    const [mine, ...others] = await joao.openMovementsOf('Ótica da Ana')
    expect(others).toEqual([])
    expect(mine.createdBy.name).toBe('Ana Souza')
  })

  test('recarregar com o lançamento já gravado: volta para corrigir e não duplica (mesma chave)', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const api = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const launches = recordLaunches(page)
    const hold = await holdResponses(page, isLaunch)
    await fillLaunch(page, '41', 'Ótica Recarregada')
    await newMovement.saveAndNext(page).click()
    await hold.waitAnswered()
    expect(await api.openMovementsOf('Ótica Recarregada')).toHaveLength(1)

    await page.reload()
    hold.release()
    await expect(newMovement.toFix(page)).toContainText('O envio foi interrompido.')
    // D27: sem resposta, não dá para dizer que não entrou.
    await header(page, 'Sair').click()
    const dialog = page.getByRole('dialog', { name: 'Sair mesmo assim?' })
    await expect(dialog).toContainText('Há 1 lançamento sem confirmação: pode ou não ter entrado.')
    await dialog.getByRole('button', { name: 'Voltar' }).click()

    await correct(page).click()
    await expectForm(page, '41', 'Ótica Recarregada')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 41: Ótica Recarregada.')).toBeVisible()
    await expect(newMovement.toFix(page)).toBeHidden()
    expect(launches).toHaveLength(2)
    expect(launches[1].postDataJSON().clientRequestId).toBe(launches[0].postDataJSON().clientRequestId)
    expect(await api.openMovementsOf('Ótica Recarregada')).toHaveLength(1)
  })

  test('recarregar antes de o lançamento chegar à API: volta para corrigir e entra uma vez', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const api = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const launches = recordLaunches(page)
    // O primeiro pedido nunca chega: fica preso até a página recarregar.
    await page.route('**/api/movements', async (route) => {
      if (isLaunch(route.request()) && launches.length === 1) return
      await route.fallback()
    })
    await fillLaunch(page, '41', 'Ótica Que Não Chegou')
    await newMovement.saveAndNext(page).click()
    await expect.poll(() => launches.length).toBe(1)
    await expect(sending(page)).toBeVisible()

    await page.reload()
    await expect(newMovement.toFix(page)).toContainText('O envio foi interrompido.')
    expect(await api.openMovementsOf('Ótica Que Não Chegou')).toHaveLength(0)
    await correct(page).click()
    await expectForm(page, '41', 'Ótica Que Não Chegou')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 41: Ótica Que Não Chegou.')).toBeVisible()
    expect(launches[1].postDataJSON().clientRequestId).toBe(launches[0].postDataJSON().clientRequestId)
    expect(await api.openMovementsOf('Ótica Que Não Chegou')).toHaveLength(1)
  })

  test('autoria: trocar de usuário com a busca da caixa pendente não lança em nome de quem entrou', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const api = await apiAs(lab.users.admin)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const launches = recordLaunches(page)
    const hold = await holdResponses(page, isBoxLookup)
    await newMovement.box(page).fill('1')
    await newMovement.client(page).fill('Ótica da Ana')
    await newMovement.orderService(page).fill('B-900')
    await newMovement.note(page).fill('com todos os campos')
    await hold.waitAnswered()
    await newMovement.saveAndNext(page).click()
    await expect(sending(page)).toBeVisible()
    expect(launches).toHaveLength(0)

    await switchTo(page, lab.users.joao)
    const lookup = hold.requests.at(-1)
    const answer = page.waitForEvent('requestfinished', (request) => request === lookup)
    hold.release()
    await answer

    // O lançamento do João é o único que sai.
    await pickFreeBox(page, '7')
    await newMovement.client(page).fill('Ótica do João')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica do João.')).toBeVisible()
    expect(launches.map((request) => request.postDataJSON().clientName)).toEqual(['Ótica do João'])
    await expect(page.getByText('Ótica da Ana')).toHaveCount(0)
    expect(await api.boxState('1')).toBe('free')
    expect(await api.openMovementsOf('Ótica da Ana')).toEqual([])

    // A Ana reencontra o lançamento e o faz em nome dela.
    await switchTo(page, lab.users.ana)
    await expect(newMovement.toFix(page)).toContainText('A sessão terminou antes de o lançamento ser confirmado.')
    await correct(page).click()
    await expectForm(page, '1', 'Ótica da Ana')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 1: Ótica da Ana.')).toBeVisible()
    const saved = await api.openMovementsOf('Ótica da Ana')
    expect(saved.map((item) => item.createdBy.name)).toEqual(['Ana Souza'])
  })
})

test.describe('"Sair" com lançamento pendente (D27)', () => {
  const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'Sair mesmo assim?' })

  /** Um lançamento recusado pela API, esperando correção. */
  async function refuseOne(page: Page, occupy: () => Promise<unknown>) {
    await page.route('**/api/movements', async (route) => {
      if (isLaunch(route.request())) await occupy()
      await route.fallback()
    })
    await fillLaunch(page, '1', 'Ótica Recusada')
    await newMovement.saveAndNext(page).click()
    await expect(newMovement.toFix(page)).toContainText('Caixa 1 · Ótica Recusada: não foi lançada')
    await page.unroute('**/api/movements')
  }

  const keptDrafts = (page: Page, userId: string) =>
    page.evaluate((id) => Object.keys(sessionStorage).filter((key) => key.startsWith(`lf:draft:${id}:`)), userId)

  test('recusado: "Voltar" leva à lista; "Sair mesmo assim" sai e apaga', async ({ openAs, apiAs, lab }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await refuseOne(page, () => joao.launch('1', 'Ótica do João'))
    await goTo(page, 'Conferência')

    await header(page, 'Sair').click()
    await expect(dialogOf(page)).toContainText('Há 1 lançamento que não entrou.')
    await dialogOf(page).getByRole('button', { name: 'Voltar' }).click()
    await expect(dialogOf(page)).toBeHidden()
    await expectScreen(page, 'Novo serviço')
    await expect(newMovement.toFix(page)).toBeFocused()
    await expect(newMovement.toFix(page)).toContainText('Ótica Recusada')
    expect(await keptDrafts(page, lab.users.ana.id)).not.toEqual([])

    await header(page, 'Sair').click()
    await dialogOf(page).getByRole('button', { name: 'Sair mesmo assim' }).click()
    await expect(page.getByRole('heading', { name: 'Lens Flow' })).toBeVisible()
    expect(await keptDrafts(page, lab.users.ana.id)).toEqual([])

    await loginInForm(page, lab.users.ana)
    await openNewMovement(page)
    await expect(newMovement.toFix(page)).toBeHidden()
    await expect(page.getByText('Ótica Recusada')).toHaveCount(0)
  })

  test('em envio: pergunta, "Voltar" fica na tela, e a pergunta fecha quando ele entra', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const hold = await holdResponses(page, isLaunch)
    await fillLaunch(page, '31', 'Ótica em Envio')
    await newMovement.saveAndNext(page).click()
    await hold.waitAnswered()

    await header(page, 'Sair').click()
    await expect(dialogOf(page)).toContainText('Há 1 lançamento ainda em envio: pode ou não entrar.')
    await dialogOf(page).getByRole('button', { name: 'Voltar' }).click()
    await expect(dialogOf(page)).toBeHidden()
    await expect(sending(page)).toBeVisible()

    await header(page, 'Sair').click()
    await expect(dialogOf(page)).toBeVisible()
    hold.release()
    await expect(dialogOf(page)).toBeHidden()
    await expect(notice(page, 'Lançado na caixa 31: Ótica em Envio.')).toBeVisible()

    // Não há mais pendência: sai direto.
    await header(page, 'Sair').click()
    await expect(page.getByRole('heading', { name: 'Lens Flow' })).toBeVisible()
  })

  test('em envio: "Sair mesmo assim" sai, e o que já chegou à API fica em nome de quem lançou', async ({
    openAs,
    apiAs,
    lab,
  }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    const hold = await holdResponses(page, isLaunch)
    await fillLaunch(page, '31', 'Ótica em Envio')
    await newMovement.saveAndNext(page).click()
    await hold.waitAnswered()
    await header(page, 'Sair').click()
    await dialogOf(page).getByRole('button', { name: 'Sair mesmo assim' }).click()
    await expect(page.getByRole('heading', { name: 'Lens Flow' })).toBeVisible()
    const answer = page.waitForEvent('requestfinished', (request) => request === hold.requests[0])
    hold.release()
    await answer

    await loginInForm(page, lab.users.joao)
    await expect(page.getByRole('list', { name: 'Serviços de hoje' })).toContainText('Lançado por Ana Souza')
    await expect(notice(page, 'Ótica em Envio')).toHaveCount(0)
    expect(await joao.openMovementsOf('Ótica em Envio')).toHaveLength(1)
    expect(await keptDrafts(page, lab.users.ana.id)).toEqual([])
  })

  test('sem pendência, nem com rascunho só digitado, não pergunta', async ({ openAs, lab }) => {
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await fillLaunch(page, '31', 'Ótica Só Digitada')
    await header(page, 'Sair').click()
    await expect(page.getByRole('heading', { name: 'Lens Flow' })).toBeVisible()
    await expect(dialogOf(page)).toHaveCount(0)
  })

  test('falha ao sair não apaga nada', async ({ openAs, apiAs, lab }) => {
    const joao = await apiAs(lab.users.joao)
    const page = await openAs(lab.users.ana, '/servicos/novo')
    await refuseOne(page, () => joao.launch('1', 'Ótica do João'))
    const before = await keptDrafts(page, lab.users.ana.id)
    await page.route('**/api/auth/logout', (route) => route.abort('connectionreset'))

    await header(page, 'Sair').click()
    await dialogOf(page).getByRole('button', { name: 'Sair mesmo assim' }).click()
    await expect(notice(page, 'Não foi possível sair.')).toBeVisible()
    await expect(page.getByTestId('current-user')).toHaveText('Ana Souza')
    await expect(newMovement.toFix(page)).toContainText('Ótica Recusada')
    expect(await keptDrafts(page, lab.users.ana.id)).toEqual(before)

    // A sessão continua valendo, e o lançamento ainda se corrige.
    await page.unroute('**/api/auth/logout')
    await correct(page).click()
    await expectForm(page, '1', 'Ótica Recusada')
    await pickFreeBox(page, '7')
    await newMovement.saveAndNext(page).click()
    await expect(notice(page, 'Lançado na caixa 7: Ótica Recusada.')).toBeVisible()
  })
})
