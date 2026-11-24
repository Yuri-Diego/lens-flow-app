import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Movement } from '@/lib/api'
import { makeMovement, mockApi, operatorUser, renderApp, summaryReply } from '@/test/utils'

// Na ordem do servidor (prioridade): urgente primeiro, depois o mais antigo.
const urgentToday = makeMovement({ id: 'a1', boxNumber: '3', color: 'vermelha', clientName: 'Ótica Rápida', delayLevel: 'normal', daysOpen: 0 })
const lateOld = makeMovement({ id: 'a2', boxNumber: '10', clientName: 'Ótica Antiga', sheetDate: '2026-11-19', delayLevel: 'late', daysOpen: 4 })
const yesterday = makeMovement({ id: 'a3', boxNumber: '2', color: 'verde', clientName: 'Ótica Ontem', sheetDate: '2026-11-22', delayLevel: 'normal', daysOpen: 1 })
const PRIORITY = [urgentToday, lateOld, yesterday]
const BY_BOX = [yesterday, urgentToday, lateOld]

function page(items: Movement[]) {
  return { status: 200, data: { items, nextCursor: null, serverDate: '2026-11-23' } }
}

function out(movement: Movement, released = true): Movement {
  return {
    ...movement,
    status: 'out',
    daysOpen: null,
    delayLevel: null,
    outAt: '2026-11-23T13:00:00.000Z',
    outBy: { id: operatorUser.id, name: operatorUser.name },
    outDate: '2026-11-23',
    boxReleasedAt: released ? '2026-11-23T13:00:00.000Z' : null,
    boxReleasedBy: released ? { id: operatorUser.id, name: operatorUser.name } : null,
  }
}

function setup(extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: operatorUser } },
    'GET /movements/summary': summaryReply({ open: 3, late: 1 }),
    'GET /movements': (config) => page((config.params as { sort?: string }).sort === 'box' ? BY_BOX : PRIORITY),
    ...(extra as object),
  })
  const user = userEvent.setup()
  return { ...api, user, ...renderApp('/conferencia') }
}

const clientNames = () =>
  screen.getAllByRole('link', { name: /Ótica/ }).map((link) => within(link).getByText(/^Ótica/).textContent)

describe('Conferência', () => {
  it('urgentes no topo (D22) e o resto agrupado por folha, da mais antiga, com o atraso em texto e ícone (D15)', async () => {
    const { calls } = setup()
    expect(await screen.findByText('Ótica Antiga')).toBeInTheDocument()

    const groups = screen.getAllByRole('region', { name: /^(Folha de|Urgentes)/ }).map((region) => region.getAttribute('aria-label'))
    expect(groups).toEqual(['Urgentes', 'Folha de 19/11', 'Folha de 22/11'])
    expect(clientNames()).toEqual(['Ótica Rápida', 'Ótica Antiga', 'Ótica Ontem'])
    const urgent = screen.getByRole('region', { name: 'Urgentes' })
    expect(within(urgent).getByText('Ótica Rápida')).toBeInTheDocument()
    // Os urgentes vêm de várias folhas: a linha mostra a folha dela.
    expect(within(urgent).getByText('folha de 23/11')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Folha de 19/11' })).getByText('Atrasado')).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/movements')).toBeTruthy()
  })

  it('"Mais antigos" agrupa só por folha, sem o grupo "Urgentes"', async () => {
    const { user } = setup()
    await screen.findByText('Ótica Antiga')

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'oldest')

    await waitFor(() =>
      expect(screen.getAllByRole('region', { name: /^Folha de/ }).map((region) => region.getAttribute('aria-label'))).toEqual([
        'Folha de 19/11',
        'Folha de 22/11',
        'Folha de 23/11',
      ]),
    )
    expect(screen.queryByRole('region', { name: 'Urgentes' })).not.toBeInTheDocument()
  })

  it('ordenar por número da caixa pede sort=box e mostra a lista da prateleira', async () => {
    const { user } = setup()
    await screen.findByText('Ótica Antiga')

    await user.selectOptions(screen.getByLabelText('Ordenar por'), 'Número da caixa')

    const shelf = await screen.findByRole('list', { name: 'Pela prateleira' })
    const names = within(shelf).getAllByRole('link').map((link) => within(link).getByText(/^Ótica/).textContent)
    expect(names).toEqual(['Ótica Ontem', 'Ótica Rápida', 'Ótica Antiga'])
    expect(screen.queryByRole('region', { name: /^Folha de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Urgentes' })).not.toBeInTheDocument()
  })

  it('filtro por cor e busca por número', async () => {
    const { user } = setup()
    await screen.findByText('Ótica Antiga')

    await user.selectOptions(screen.getByLabelText('Filtrar por categoria ou cor'), 'Vermelha (Urgente)')
    expect(clientNames()).toEqual(['Ótica Rápida'])
    await user.selectOptions(screen.getByLabelText('Filtrar por categoria ou cor'), 'Com montagem')
    expect(clientNames()).toEqual(['Ótica Ontem'])

    await user.selectOptions(screen.getByLabelText('Filtrar por categoria ou cor'), 'Todas as caixas')
    await user.type(screen.getByLabelText('Buscar pelo número da caixa'), '10')
    expect(clientNames()).toEqual(['Ótica Antiga'])
  })

  it('"Liberar caixa" fica desabilitado até "Saiu" (D6)', async () => {
    setup()
    const row = (await screen.findByText('Ótica Antiga')).closest('li') as HTMLElement
    expect(within(row).getByRole('checkbox', { name: 'Liberar caixa' })).toBeDisabled()
    expect(within(row).getByRole('checkbox', { name: 'Liberar caixa' })).toHaveAccessibleDescription('dê baixa antes')
  })

  it('"Saiu e liberar" tira a linha na hora e "Desfazer" traz de volta', async () => {
    const { user, calls } = setup({
      'POST /movements/batch': {
        status: 200,
        data: { batchId: 'lote-1', action: 'checkout-and-release', results: [{ id: 'a2', ok: true, movement: out(lateOld) }], summary: { requested: 1, succeeded: 1, failed: 0 } },
      },
      'POST /movements/batch/lote-1/undo': {
        status: 200,
        data: { batchId: 'lote-1', results: [{ id: 'a2', ok: true, movement: lateOld }], summary: { requested: 1, succeeded: 1, failed: 0 } },
      },
    })
    const row = (await screen.findByText('Ótica Antiga')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('button', { name: 'Saiu e liberar' }))

    expect(screen.queryByText('Ótica Antiga')).not.toBeInTheDocument()
    const toast = (await screen.findByText(/Saiu e caixa liberada: caixa 10/)).closest('[role="status"]') as HTMLElement
    expect(calls.find((call) => call.url === '/movements/batch')?.data).toMatchObject({ ids: ['a2'], action: 'checkout-and-release' })

    await user.click(within(toast).getByRole('button', { name: 'Desfazer' }))
    expect(await screen.findByText('Ótica Antiga')).toBeInTheDocument()
    expect(calls.some((call) => call.url === '/movements/batch/lote-1/undo')).toBe(true)
  })

  it('UI otimista com rollback: se a baixa falha, a linha volta como estava', async () => {
    const { user } = setup({ 'POST /movements/a2/checkout': 'network-error' })
    const row = (await screen.findByText('Ótica Antiga')).closest('li') as HTMLElement
    await user.click(within(row).getByRole('checkbox', { name: 'Saiu' }))

    expect(await screen.findByText(/Nada foi alterado. Sem conexão/)).toBeInTheDocument()
    const again = screen.getByText('Ótica Antiga').closest('li') as HTMLElement
    expect(within(again).getByRole('checkbox', { name: 'Saiu' })).toHaveAttribute('aria-checked', 'false')
  })

  it('lote com falha parcial: mostra o que falhou, mantém selecionado e oferece "Desfazer lote"', async () => {
    const { user, calls } = setup({
      'POST /movements/batch': {
        status: 200,
        data: {
          batchId: 'lote-2',
          action: 'checkout-and-release',
          results: [
            { id: 'a1', ok: true, movement: out(urgentToday) },
            { id: 'a2', ok: false, error: { code: 'CONFLICT', message: 'Esse serviço já saiu e a caixa já foi liberada.' } },
            { id: 'a3', ok: true, movement: out(yesterday) },
          ],
          summary: { requested: 3, succeeded: 2, failed: 1 },
        },
      },
      'POST /movements/batch/lote-2/undo': {
        status: 200,
        data: { batchId: 'lote-2', results: [{ id: 'a1', ok: true, movement: urgentToday }, { id: 'a3', ok: true, movement: yesterday }], summary: { requested: 2, succeeded: 2, failed: 0 } },
      },
    })
    await screen.findByText('Ótica Antiga')
    await user.click(screen.getByRole('button', { name: 'Selecionar' }))
    await user.click(screen.getByRole('button', { name: 'Selecionar visíveis' }))
    await user.click(screen.getByRole('button', { name: 'Dar baixa e liberar (3)' }))

    const result = await screen.findByText('1 serviço não foi alterado')
    const alert = result.closest('[role="alert"]') as HTMLElement
    expect(within(alert).getByText(/Caixa 10 · Ótica Antiga/)).toBeInTheDocument()
    expect(within(alert).getByText(/já saiu e a caixa já foi liberada/)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Selecionar caixa 10/ })).toHaveAttribute('aria-checked', 'true')
    expect(screen.queryByText('Ótica Rápida')).not.toBeInTheDocument()

    const toast = screen.getByText(/Baixa e liberação de 2 serviços de 3/).closest('[role="status"]') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Desfazer lote' }))
    await waitFor(() => expect(calls.some((call) => call.url === '/movements/batch/lote-2/undo')).toBe(true))
    expect(await screen.findByText('Ótica Rápida')).toBeInTheDocument()
  })
})
