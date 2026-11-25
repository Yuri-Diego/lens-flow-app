import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Box } from '@/lib/api'
import { makeBox, makeMovement, mockApi, operatorUser, renderApp, summaryReply } from '@/test/utils'

const freeBox = makeBox({ number: '12', color: 'vermelha' })
const occupiedBox = makeBox({
  number: '7',
  color: 'azul',
  state: 'occupied',
  currentMovement: {
    id: 'm-sol',
    clientName: 'Ótica Sol',
    orderService: '900',
    status: 'open',
    sheetDate: '2026-11-22',
    createdAt: '2026-11-22T12:00:00.000Z',
    createdBy: { id: 'u1', name: 'Ana Souza' },
  },
})

function setup(extra: Record<string, unknown> = {}) {
  const boxes: Record<string, Box> = { '12': freeBox, '7': occupiedBox }
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: operatorUser } },
    'GET /movements/summary': summaryReply(),
    'GET /boxes': (config) => {
      const box = boxes[(config.params as { number: string }).number]
      return { status: 200, data: { boxes: box ? [box] : [] } }
    },
    'GET /movements': { status: 200, data: { items: [], nextCursor: null, serverDate: '2026-11-23' } },
    'POST /movements': (config) => {
      const body = JSON.parse(config.data as string) as { clientName: string }
      return {
        status: 201,
        data: { movement: makeMovement({ id: 'novo-1', boxNumber: '12', color: 'vermelha', clientName: body.clientName }), warnings: [] },
      }
    },
    ...(extra as object),
  })
  const user = userEvent.setup()
  const view = renderApp('/servicos/novo')
  return { ...api, user, ...view }
}

const posts = (calls: Array<{ method: string; url: string; data: unknown }>) =>
  calls.filter((call) => call.method === 'POST' && call.url === '/movements')

describe('Novo serviço', () => {
  it('o número acha a caixa livre e ela já fica escolhida (D4)', async () => {
    const { user } = setup()
    const box = await screen.findByLabelText('Caixa')
    expect(box).toHaveFocus()
    expect(box).toHaveAttribute('inputmode', 'numeric')

    await user.type(box, '12')
    expect(await screen.findByText('Livre · escolhida')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Caixa 12, Vermelha, Urgente' })).toBeInTheDocument()
  })

  it('Enter avança entre os campos e "Salvar e próximo" limpa e devolve o foco à caixa', async () => {
    const { user, calls } = setup()
    const box = await screen.findByLabelText('Caixa')
    await user.type(box, '12')
    await screen.findByText('Livre · escolhida')
    await user.keyboard('{Enter}')
    expect(screen.getByLabelText('Cliente')).toHaveFocus()
    await user.keyboard('Ótica Central{Enter}')
    expect(screen.getByLabelText('OS (opcional)')).toHaveFocus()
    await user.keyboard('4521{Enter}')
    expect(screen.getByLabelText('Observação (opcional)')).toHaveFocus()

    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))

    expect(box).toHaveFocus()
    expect(box).toHaveValue('')
    expect(screen.getByLabelText('Cliente')).toHaveValue('')
    expect(await screen.findByText(/Lançado na caixa 12: Ótica Central/)).toBeInTheDocument()
    expect(posts(calls)).toHaveLength(1)
    expect(posts(calls)[0].data).toMatchObject({
      boxId: freeBox.id,
      clientName: 'Ótica Central',
      orderService: '4521',
      clientRequestId: expect.any(String),
    })
  })

  it('sugere os clientes já usados (D24): um toque escolhe e leva à OS, sem segurar o "Salvar e próximo"', async () => {
    let resolveSlow: (() => void) | null = null
    const { user, calls } = setup({
      'GET /clients/suggestions': (config: { params: { q: string } }) =>
        config.params.q === 'Ótica Ce'
          ? { status: 200, data: { items: [{ name: 'Ótica Central', uses: 42, lastUsedAt: '2026-11-23T14:02:00.000Z' }] } }
          : // Uma busca lenta não pode atrasar o lançamento.
            new Promise((resolve) => {
              resolveSlow = () => resolve({ status: 200, data: { items: [] } })
            }),
    })
    const box = await screen.findByLabelText('Caixa')
    await user.type(box, '12')
    await screen.findByText('Livre · escolhida')
    await user.keyboard('{Enter}')
    await user.keyboard('Ótica Ce')

    await user.click(await screen.findByRole('option', { name: 'Ótica Central' }))
    expect(screen.getByLabelText('Cliente')).toHaveValue('Ótica Central')
    expect(screen.getByLabelText('OS (opcional)')).toHaveFocus()

    // Texto livre, com a busca de sugestões ainda pendurada.
    await user.clear(screen.getByLabelText('Cliente'))
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Nova Era')
    await new Promise((resolve) => setTimeout(resolve, 250))
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))

    expect(box).toHaveFocus()
    expect(await screen.findByText(/Lançado na caixa 12: Ótica Nova Era/)).toBeInTheDocument()
    expect(posts(calls)).toHaveLength(1)
    ;(resolveSlow as (() => void) | null)?.()
  })

  it('caixa ocupada aparece desabilitada com cliente, autor e data, e não deixa salvar', async () => {
    const { user, calls } = setup()
    await user.type(await screen.findByLabelText('Caixa'), '7')

    expect(await screen.findByText('Ocupada por Ótica Sol, lançado por Ana Souza em 22/11.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Lua')
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))

    expect(screen.getByLabelText('Caixa')).toHaveAccessibleDescription(/Ocupada por Ótica Sol.*Escolha outra caixa/)
    expect(screen.getByLabelText('Caixa')).toHaveFocus()
    expect(screen.getByLabelText('Cliente')).toHaveValue('Ótica Lua')
    expect(posts(calls)).toHaveLength(0)
  })

  it('erro por campo: sem cliente, avisa junto do campo e não envia', async () => {
    const { user, calls } = setup()
    await user.type(await screen.findByLabelText('Caixa'), '12')
    await screen.findByText('Livre · escolhida')
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))

    expect(screen.getByLabelText('Cliente')).toHaveAccessibleDescription('Informe o cliente.')
    expect(screen.getByLabelText('Cliente')).toHaveFocus()
    expect(screen.getByLabelText('Caixa')).toHaveValue('12')
    expect(posts(calls)).toHaveLength(0)
  })

  it('OS repetida gera aviso com o lugar dela, sem bloquear (D16)', async () => {
    const other = makeMovement({ boxNumber: '15', color: 'azul', orderService: '4521', sheetDate: '2026-11-22' })
    const { user, calls } = setup({
      'GET /movements': (config: { params: { orderService?: string } }) => ({
        status: 200,
        data: { items: config.params.orderService === '4521' ? [other] : [], nextCursor: null, serverDate: '2026-11-23' },
      }),
    })
    await user.type(await screen.findByLabelText('Caixa'), '12')
    await screen.findByText('Livre · escolhida')
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Central')
    await user.type(screen.getByLabelText('OS (opcional)'), '4521')

    expect(await screen.findByText(/A OS 4521 já está na caixa 15 \(Azul\), aberta desde 22\/11\./)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
    await waitFor(() => expect(posts(calls)).toHaveLength(1))
  })

  it('409 BOX_OCCUPIED: explica com o cliente da caixa e "Corrigir" devolve tudo o que foi digitado', async () => {
    const { user } = setup({
      'POST /movements': {
        status: 409,
        data: {
          error: {
            code: 'BOX_OCCUPIED',
            message: 'A caixa 12 já está ocupada: Ótica Sol, lançado por Ana Souza em 23/11.',
            details: { box: occupiedBox },
          },
        },
      },
    })
    await user.type(await screen.findByLabelText('Caixa'), '12')
    await screen.findByText('Livre · escolhida')
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Central')
    await user.type(screen.getByLabelText('OS (opcional)'), '4521')
    await user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))

    const pending = await screen.findByRole('region', { name: 'Lançamentos para corrigir' })
    expect(within(pending).getByText(/Ótica Sol, lançado por Ana Souza/)).toBeInTheDocument()

    await user.click(within(pending).getByRole('button', { name: 'Corrigir' }))
    expect(screen.getByLabelText('Caixa')).toHaveValue('12')
    expect(screen.getByLabelText('Cliente')).toHaveValue('Ótica Central')
    expect(screen.getByLabelText('OS (opcional)')).toHaveValue('4521')
    expect(screen.getByLabelText('Caixa')).toHaveAccessibleDescription(/já está ocupada: Ótica Sol/)
  })

  describe('o aviso de "não foi lançada" (F7-2)', () => {
    /** As duas caixas aparecem livres, mas o envio é recusado. */
    async function launchTwoRefused() {
      const boxes: Record<string, Box> = { '12': freeBox, '15': makeBox({ number: '15', color: 'verde' }) }
      const view = setup({
        'GET /boxes': (config: { params: { number: string } }) => {
          const box = boxes[config.params.number]
          return { status: 200, data: { boxes: box ? [box] : [] } }
        },
        'POST /movements': {
          status: 409,
          data: { error: { code: 'BOX_OCCUPIED', message: 'A caixa já está ocupada.', details: {} } },
        },
      })
      for (const [number, client] of [
        ['12', 'Ótica Um'],
        ['15', 'Ótica Dois'],
      ]) {
        await view.user.type(await screen.findByLabelText('Caixa'), number)
        await screen.findByText('Livre · escolhida')
        await view.user.type(screen.getByLabelText('Cliente'), client)
        await view.user.click(screen.getByRole('button', { name: 'Salvar e próximo' }))
        await notices().findByText(new RegExp(`${client}.*não foi lançada`))
      }
      return view
    }

    const notices = () => within(screen.getByRole('region', { name: 'Avisos' }))
    const toFix = () => within(screen.getByRole('region', { name: 'Lançamentos para corrigir' }))
    /** O "Corrigir" da Ótica Um, o primeiro dos dois. */
    const fixFirst = (area: ReturnType<typeof within>) => area.getAllByRole('button', { name: 'Corrigir' })[0]

    function expectOnlyFirstFixed() {
      expect(screen.getByLabelText('Cliente')).toHaveValue('Ótica Um')
      for (const area of [notices(), toFix()]) {
        expect(area.queryByText(/Ótica Um/)).not.toBeInTheDocument()
        expect(area.getByText(/Ótica Dois/)).toBeInTheDocument()
      }
    }

    it('"Corrigir" na lista fecha só o aviso daquele lançamento', async () => {
      const { user } = await launchTwoRefused()
      await user.click(fixFirst(toFix()))
      expectOnlyFirstFixed()
    })

    it('"Corrigir" no aviso fecha o aviso e tira só aquele lançamento da lista', async () => {
      const { user } = await launchTwoRefused()
      await user.click(fixFirst(notices()))
      expectOnlyFirstFixed()
    })

    it('"Corrigir" na lista fecha o aviso mesmo depois de sair da tela e voltar', async () => {
      const { user, router } = await launchTwoRefused()
      await act(() => router.navigate('/hoje'))
      await screen.findByRole('heading', { name: 'Hoje' })
      await act(() => router.navigate('/servicos/novo'))
      await screen.findByRole('region', { name: 'Lançamentos para corrigir' })

      await user.click(fixFirst(toFix()))
      expectOnlyFirstFixed()
    })
  })

  // O jsdom não calcula layout: a posição de verdade é conferida no E2E (launch.spec.ts).
  it('a barra de "Salvar e próximo" é fixa também no computador, com os avisos acima dela (F7-1)', async () => {
    setup()
    const bar = (await screen.findByRole('button', { name: 'Salvar e próximo' })).closest('.fixed')
    expect(bar).toHaveClass('md:bottom-0', 'md:left-64')
    expect(bar).not.toHaveClass('md:static')
    expect(screen.getByRole('region', { name: 'Avisos' })).toHaveStyle({ transform: 'translateY(-72px)' })
  })

  it('toque duplo em "Salvar e próximo" envia uma vez só', async () => {
    const { user, calls } = setup()
    await user.type(await screen.findByLabelText('Caixa'), '12')
    await screen.findByText('Livre · escolhida')
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Central')
    await user.dblClick(screen.getByRole('button', { name: 'Salvar e próximo' }))

    await screen.findByText(/Lançado na caixa 12/)
    expect(posts(calls)).toHaveLength(1)
    expect(screen.queryByText('Informe o cliente.')).not.toBeInTheDocument()
  })

  it('"Desfazer" no aviso exclui o lançamento', async () => {
    const { user, calls } = setup({ 'DELETE /movements/novo-1': { status: 204 } })
    await user.type(await screen.findByLabelText('Caixa'), '12')
    await screen.findByText('Livre · escolhida')
    await user.type(screen.getByLabelText('Cliente'), 'Ótica Central{Enter}{Enter}{Enter}')

    const toast = (await screen.findByText(/Lançado na caixa 12/)).closest('[role="status"]') as HTMLElement
    await user.click(within(toast).getByRole('button', { name: 'Desfazer' }))

    expect(await screen.findByText('Lançamento desfeito. A caixa 12 está livre de novo.')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'DELETE' && call.url === '/movements/novo-1')).toBe(true)
  })
})
