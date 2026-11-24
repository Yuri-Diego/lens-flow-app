import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Movement } from '@/lib/api'
import { makeBox, makeMovement, mockApi, operatorUser, renderApp, summaryReply } from '@/test/utils'

const history = [
  { id: 'h1', action: 'movement.create', at: '2026-11-22T11:12:00.000Z', user: { id: 'u1', name: 'Ana Souza' }, before: null, after: { box: { number: '12' } } },
  { id: 'h2', action: 'movement.checkout', at: '2026-11-23T12:03:00.000Z', user: { id: operatorUser.id, name: 'João Lima' }, before: { status: 'open' }, after: { status: 'out' } },
]

function setup(movement: Movement, extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: operatorUser } },
    'GET /movements/summary': summaryReply(),
    [`GET /movements/${movement.id}`]: { status: 200, data: { movement, history, serverDate: '2026-11-23' } },
    ...(extra as object),
  })
  const user = userEvent.setup()
  return { ...api, user, ...renderApp(`/servicos/${movement.id}`) }
}

describe('Detalhe do serviço', () => {
  it('mostra a linha do tempo e, para o operador, "Trocar caixa" sem Editar/Excluir (D19, RN-11)', async () => {
    const movement = makeMovement({ id: 'd1', sheetDate: '2026-11-22', canEdit: false, canChangeBox: true })
    setup(movement)

    const timeline = await screen.findByRole('list', { name: 'Linha do tempo' })
    expect(within(timeline).getByText('Lançado por Ana Souza na caixa 12')).toBeInTheDocument()
    expect(within(timeline).getByText('Baixa por João Lima')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Trocar caixa' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
  })

  it('"Trocar caixa" usa o mesmo seletor e avisa a caixa ocupada', async () => {
    const movement = makeMovement({ id: 'd2', canEdit: false, canChangeBox: true })
    const busy = makeBox({
      number: '15',
      state: 'occupied',
      currentMovement: {
        id: 'x',
        clientName: 'Ótica Sol',
        orderService: null,
        status: 'open',
        sheetDate: '2026-11-21',
        createdAt: '2026-11-21T12:00:00.000Z',
        createdBy: { id: 'u1', name: 'Ana Souza' },
      },
    })
    const free = makeBox({ number: '16', color: 'verde' })
    const { user, calls } = setup(movement, {
      'GET /boxes': (config: { params: { number: string } }) => ({
        status: 200,
        data: { boxes: config.params.number === '15' ? [busy] : config.params.number === '16' ? [free] : [] },
      }),
      'POST /movements/d2/change-box': {
        status: 200,
        data: { movement: { ...movement, box: { ...movement.box, id: free.id, number: '16', color: 'verde' } } },
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Trocar caixa' }))
    const dialog = screen.getByRole('dialog', { name: 'Trocar caixa' })
    await user.type(within(dialog).getByLabelText('Caixa nova'), '15')
    expect(await within(dialog).findByText('Ocupada por Ótica Sol, lançado por Ana Souza em 21/11.')).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Caixa nova'))
    await user.type(within(dialog).getByLabelText('Caixa nova'), '16')
    await user.click(await within(dialog).findByRole('button', { name: 'Trocar para a caixa 16' }))

    expect(await screen.findByText(/Caixa trocada: Ótica Central saiu da caixa 12 e foi para a 16/)).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/movements/d2/change-box')?.data).toEqual({ boxId: free.id })
  })

  it('"Desfazer baixa" com contagem regressiva chama o desfazer do item', async () => {
    const until = new Date(Date.now() + 5 * 60_000).toISOString()
    const movement = makeMovement({
      id: 'd3',
      status: 'out',
      daysOpen: null,
      delayLevel: null,
      outAt: '2026-11-23T12:03:00.000Z',
      outBy: { id: operatorUser.id, name: 'João Lima' },
      outDate: '2026-11-23',
      undo: { action: 'checkout', until },
    })
    const { user, calls } = setup(movement, {
      'POST /movements/d3/undo': { status: 200, data: { movement: makeMovement({ id: 'd3' }) } },
    })

    const button = await screen.findByRole('button', { name: /Desfazer baixa \([45]:\d{2}\)/ })
    expect(screen.queryByRole('button', { name: 'Trocar caixa' })).not.toBeInTheDocument()
    await user.click(button)

    expect(await screen.findByText(/Baixa desfeita: caixa 12/)).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/movements/d3/undo')?.data).toEqual({ action: 'checkout' })
  })
})
