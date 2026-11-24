import type { Box } from '@/lib/api'
import { validateBoxNumber } from './api'

/**
 * Lista do cadastro em lote (RN-13, contrato 3.10), igual ao backend
 * (`domain/boxNumbers.js`): "3, 12, 27-30" vira 3, 12, 27, 28, 29 e 30, na
 * ordem digitada e com as repetições. Vírgula, ponto e vírgula, espaço ou
 * quebra de linha separam os itens; hífen ou travessão fazem o intervalo.
 * Com zero à esquerda, o intervalo mantém a largura (D18): "007-010" vira 007,
 * 008, 009 e 010, e as duas pontas precisam ter a mesma quantidade de dígitos.
 */
export const BATCH_MAX_ITEMS = 500
export const BATCH_MAX_TEXT = 2000

const DIGITS = /^\d+$/
const RANGE = /^(\d+)-(\d+)$/
const MAX_ECHO = 20

export type ParsedBatch = { numbers: string[]; error?: undefined } | { numbers?: undefined; error: string }

function echo(token: string): string {
  return token.length > MAX_ECHO ? `${token.slice(0, MAX_ECHO)}…` : token
}

function hasLeadingZero(value: string): boolean {
  return value.length > 1 && value.startsWith('0')
}

const tooMany = (): ParsedBatch => ({ error: `Cadastre no máximo ${BATCH_MAX_ITEMS} caixas por lote.` })

export function parseBatchNumbers(text: string): ParsedBatch {
  if (text.length > BATCH_MAX_TEXT) return { error: `A lista pode ter no máximo ${BATCH_MAX_TEXT} caracteres.` }
  const tokens = text
    .replace(/\s*[-–—]\s*/g, '-')
    .split(/[\s,;]+/)
    .filter(Boolean)
  if (tokens.length === 0) return { error: 'Informe pelo menos um número.' }

  const numbers: string[] = []
  for (const token of tokens) {
    const range = RANGE.exec(token)
    if (range) {
      const [, rawStart, rawEnd] = range
      const problem = validateBoxNumber(rawStart) ?? validateBoxNumber(rawEnd)
      if (problem) return { error: `Intervalo "${echo(token)}": ${problem}` }
      const padded = hasLeadingZero(rawStart) || hasLeadingZero(rawEnd)
      if (padded && rawStart.length !== rawEnd.length) {
        return {
          error: `Intervalo "${echo(token)}": com zero à esquerda, use a mesma quantidade de dígitos nas duas pontas, por exemplo 007-012.`,
        }
      }
      const from = Number(rawStart)
      const to = Number(rawEnd)
      if (from > to) {
        return { error: `Intervalo "${echo(token)}" invertido: o primeiro número precisa ser menor ou igual ao segundo.` }
      }
      // Confere o total antes de expandir: "1-999999" não monta a lista.
      if (numbers.length + (to - from + 1) > BATCH_MAX_ITEMS) return tooMany()
      for (let number = from; number <= to; number += 1) {
        numbers.push(padded ? String(number).padStart(rawStart.length, '0') : String(number))
      }
      continue
    }

    if (!DIGITS.test(token)) {
      return { error: `"${echo(token)}" não é um número nem um intervalo. Use, por exemplo, 12 ou 27-30.` }
    }
    const problem = validateBoxNumber(token)
    if (problem) return { error: `"${echo(token)}": ${problem}` }
    if (numbers.length + 1 > BATCH_MAX_ITEMS) return tooMany()
    numbers.push(token)
  }
  return { numbers }
}

export type PreviewStatus = { kind: 'new' } | { kind: 'repeated' } | { kind: 'exists'; box: Box }

export interface PreviewItem {
  number: string
  status: PreviewStatus
}

/**
 * Pré-visualização: o que vai ser criado, o que se repete no próprio lote e o
 * que já existe na empresa, em qualquer cor (D4). A comparação é exata (D18):
 * "07" e "7" não são repetição.
 */
export function previewBatch(numbers: string[], existing: Box[]): PreviewItem[] {
  const byNumber = new Map(existing.map((box) => [box.number, box]))
  const seen = new Set<string>()
  return numbers.map((number) => {
    const box = byNumber.get(number)
    if (seen.has(number)) return { number, status: { kind: 'repeated' } }
    seen.add(number)
    if (box) return { number, status: { kind: 'exists', box } }
    return { number, status: { kind: 'new' } }
  })
}
