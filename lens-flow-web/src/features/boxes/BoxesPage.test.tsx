import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { Box } from '@/lib/api'
import { adminUser, makeBox, mockApi, renderApp } from '@/test/utils'

const free3 = makeBox({ number: '3', color: 'vermelha' })
const busy12 = makeBox({
  number: '12',
  color: 'azul',
  state: 'occupied',
  currentMovement: {
    id: 'mov-12',
    clientName: 'Ótica Central',
    orderService: '4521',
    status: 'open',
    sheetDate: '2026-11-22',
    createdAt: '2026-11-22T11:12:00.000Z',
    createdBy: { id: 'u1', name: 'Ana Souza' },
  },
})
const off8 = makeBox({ number: '8', color: 'azul', active: false })
const BOXES = [free3, off8, busy12]

function setup(handlers: Record<string, unknown> = {}, boxes: Box[] = BOXES) {
  const api = mockApi({
    'GET /auth/me': { status: 200, data: { user: adminUser } },
    'GET /boxes': { status: 200, data: { boxes } },
    ...(handlers as object),
  })
  const user = userEvent.setup()
  return { ...api, user, ...renderApp('/caixas') }
}

describe('Caixas (admin)', () => {
  it('grade por cor com o estado em texto; a ocupada leva ao serviço', async () => {
    setup()
    const blue = await screen.findByRole('region', { name: 'Caixas Azul' })
    const red = screen.getByRole('region', { name: 'Caixas Vermelha' })
    expect(screen.getAllByRole('region', { name: /^Caixas / }).map((region) => region.getAttribute('aria-label'))).toEqual([
      'Caixas Vermelha',
      'Caixas Azul',
    ])

    expect(within(red).getByRole('button', { name: 'Caixa 3, livre. Editar' })).toBeInTheDocument()
    expect(within(blue).getByRole('button', { name: 'Caixa 8, desativada. Editar' })).toBeInTheDocument()
    const busy = within(blue).getByRole('link', { name: /Caixa 12, ocupada: Ótica Central/ })
    expect(busy).toHaveAttribute('href', '/servicos/mov-12')
    expect(screen.getByText('2 ativas · 1 livre · 1 ocupada')).toBeInTheDocument()
  })

  it('filtra por estado', async () => {
    const { user } = setup()
    await screen.findByRole('region', { name: 'Caixas Azul' })

    await user.click(screen.getByRole('button', { name: 'Desativadas' }))
    expect(screen.getByRole('button', { name: 'Caixa 8, desativada. Editar' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Caixas Vermelha' })).not.toBeInTheDocument()
  })

  it('lote: pré-visualiza com o zero à esquerda, aponta repetidos e existentes, e mostra o resultado item a item', async () => {
    const { user, calls } = setup({
      'POST /boxes/batch': {
        status: 200,
        data: {
          results: [
            { number: '007', ok: true, box: makeBox({ number: '007', color: 'verde' }) },
            { number: '008', ok: true, box: makeBox({ number: '008', color: 'verde' }) },
            { number: '12', ok: false, error: { code: 'CONFLICT', message: 'Já existe a caixa 12 (Azul).' } },
            { number: '007', ok: false, error: { code: 'DUPLICATE_IN_BATCH', message: 'Número repetido neste lote.' } },
          ],
          summary: { requested: 4, created: 2, failed: 2 },
        },
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Cadastrar caixas' }))
    const dialog = screen.getByRole('dialog', { name: 'Cadastrar caixas' })

    await user.click(within(dialog).getByRole('radio', { name: 'Verde, Com montagem' }))
    await user.type(within(dialog).getByLabelText('Números'), '007-008, 12, 007')

    const preview = await within(dialog).findByRole('region', { name: 'Pré-visualização' })
    await waitFor(() => expect(preview).toHaveTextContent('Vai criar 2 caixas na cor Verde. 2 números não entram.'))
    expect(preview).toHaveTextContent('12: já existe (Azul)')
    expect(preview).toHaveTextContent('007: repetido nesta lista')

    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar 2 caixas' }))

    const result = await screen.findByRole('dialog', { name: 'Resultado do cadastro' })
    expect(within(result).getByText('2 caixas criadas · 2 não entraram')).toBeInTheDocument()
    const items = within(within(result).getByRole('list', { name: 'Resultado item a item' })).getAllByRole('listitem')
    expect(items.map((item) => item.textContent)).toEqual([
      '007criada',
      '008criada',
      '12Já existe a caixa 12 (Azul).',
      '007Número repetido neste lote.',
    ])
    // O texto vai como foi digitado; o servidor expande de novo.
    expect(calls.find((call) => call.method === 'POST')?.data).toEqual({ color: 'verde', numbers: '007-008, 12, 007' })
  })

  it('lote: sem cor ou com intervalo inválido, avisa junto do campo e não envia', async () => {
    const { user, calls } = setup()
    await user.click(await screen.findByRole('button', { name: 'Cadastrar caixas' }))
    const dialog = screen.getByRole('dialog', { name: 'Cadastrar caixas' })

    await user.type(within(dialog).getByLabelText('Números'), '7-010')
    expect(await within(dialog).findByText(/mesma quantidade de dígitos/)).toBeInTheDocument()

    await user.clear(within(dialog).getByLabelText('Números'))
    await user.type(within(dialog).getByLabelText('Números'), '20-22')
    await user.click(within(dialog).getByRole('button', { name: 'Cadastrar' }))
    expect(within(dialog).getByText('Escolha a cor das caixas.')).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'POST')).toBe(false)
  })

  it('editar: número repetido volta junto do campo, sem perder o que foi digitado', async () => {
    const { user } = setup({
      [`PATCH /boxes/${free3.id}`]: {
        status: 409,
        data: {
          error: {
            code: 'CONFLICT',
            message: 'Já existe a caixa 12 (Azul).',
            fields: { number: 'Já existe a caixa 12 (Azul). O número não se repete, nem em outra cor.' },
          },
        },
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Caixa 3, livre. Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Caixa 3' })
    const number = within(dialog).getByLabelText('Número')
    await user.clear(number)
    await user.type(number, '12')
    await user.click(within(dialog).getByRole('button', { name: 'Salvar' }))

    expect(await within(dialog).findByText('Já existe a caixa 12 (Azul). O número não se repete, nem em outra cor.')).toBeInTheDocument()
    expect(number).toHaveValue('12')
  })

  it('desativar: caixa que ficou ocupada explica com o serviço que está nela', async () => {
    const { user } = setup({
      [`PATCH /boxes/${free3.id}`]: {
        status: 409,
        data: { error: { code: 'BOX_OCCUPIED', message: 'A caixa está ocupada.', details: { box: { ...busy12, number: '3' } } } },
      },
    })
    await user.click(await screen.findByRole('button', { name: 'Caixa 3, livre. Editar' }))
    const dialog = screen.getByRole('dialog', { name: 'Caixa 3' })
    await user.click(within(dialog).getByRole('button', { name: 'Desativar caixa' }))

    expect(
      await within(dialog).findByText(/Ocupada por Ótica Central, lançado por Ana Souza em 22\/11\. .*libere a caixa antes/),
    ).toBeInTheDocument()
  })

  it('desativar envia active: false e avisa com "Desfazer"', async () => {
    const { user, calls } = setup({
      [`PATCH /boxes/${free3.id}`]: { status: 200, data: { box: { ...free3, active: false } } },
    })
    await user.click(await screen.findByRole('button', { name: 'Caixa 3, livre. Editar' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Caixa 3' })).getByRole('button', { name: 'Desativar caixa' }))

    expect(await screen.findByText('Caixa 3 desativada. Ela não recebe mais serviço.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desfazer' })).toBeInTheDocument()
    expect(calls.find((call) => call.method === 'PATCH')?.data).toEqual({ active: false })
  })
})
