import { describe, expect, it } from 'vitest'
import { makeBox } from '@/test/utils'
import { parseBatchNumbers, previewBatch } from './batchNumbers'

describe('Lista do cadastro em lote (RN-13, contrato 3.10)', () => {
  it('expande intervalos, na ordem digitada', () => {
    expect(parseBatchNumbers('3, 12, 27-30')).toEqual({ numbers: ['3', '12', '27', '28', '29', '30'] })
  })

  it('aceita vírgula, ponto e vírgula, espaço, quebra de linha e travessão', () => {
    expect(parseBatchNumbers('1;2 3\n4,5 – 6\t7—8 9 - 10')).toEqual({
      numbers: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    })
  })

  it('mantém o zero à esquerda e a largura das pontas (D18)', () => {
    expect(parseBatchNumbers('007-010')).toEqual({ numbers: ['007', '008', '009', '010'] })
    expect(parseBatchNumbers('07, 7')).toEqual({ numbers: ['07', '7'] })
    expect(parseBatchNumbers('098-101')).toEqual({ numbers: ['098', '099', '100', '101'] })
  })

  it('recusa intervalo com zero à esquerda e larguras diferentes', () => {
    expect(parseBatchNumbers('7-010').error).toMatch(/mesma quantidade de dígitos/)
    expect(parseBatchNumbers('007-10').error).toMatch(/mesma quantidade de dígitos/)
  })

  it('mantém as repetições, para o resultado apontar cada uma', () => {
    expect(parseBatchNumbers('27-29, 28')).toEqual({ numbers: ['27', '28', '29', '28'] })
  })

  it('explica cada entrada inválida', () => {
    expect(parseBatchNumbers('').error).toBe('Informe pelo menos um número.')
    expect(parseBatchNumbers(' , ; ').error).toBe('Informe pelo menos um número.')
    expect(parseBatchNumbers('3, abc').error).toMatch(/"abc" não é um número nem um intervalo/)
    expect(parseBatchNumbers('27-').error).toMatch(/não é um número nem um intervalo/)
    expect(parseBatchNumbers('30-27').error).toMatch(/invertido/)
    expect(parseBatchNumbers('0').error).toMatch(/maior que zero/)
    expect(parseBatchNumbers('0-5').error).toMatch(/maior que zero/)
    expect(parseBatchNumbers('1234567').error).toMatch(/6 dígitos/)
  })

  it('no máximo 500 números, sem montar a lista de um intervalo enorme', () => {
    expect(parseBatchNumbers('1-500').numbers).toHaveLength(500)
    expect(parseBatchNumbers('1-500, 501').error).toMatch(/no máximo 500/)
    expect(parseBatchNumbers('1-999999').error).toMatch(/no máximo 500/)
  })

  it('pré-visualização: novas, repetidas no lote e as que já existem em qualquer cor (D4)', () => {
    const existing = [makeBox({ number: '12', color: 'azul' }), makeBox({ number: '7', color: 'verde' })]
    const parsed = parseBatchNumbers('3, 12, 3, 07')
    expect(previewBatch(parsed.numbers ?? [], existing).map((item) => [item.number, item.status.kind])).toEqual([
      ['3', 'new'],
      ['12', 'exists'],
      ['3', 'repeated'],
      // "07" e "7" são caixas diferentes (D18).
      ['07', 'new'],
    ])
  })
})
