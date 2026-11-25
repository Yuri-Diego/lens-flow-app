import { request } from '@playwright/test'
import { API_URL, TIME_ZONE } from '../env'

/**
 * O laboratório de um teste (empresa própria), com o conjunto fixo de
 * lens-flow-backend/scripts/e2eLab.js. Cada teste tem o seu: nenhum depende do
 * que outro fez, e os dois projetos rodam ao mesmo tempo.
 */
export interface Lab {
  business: { id: string; name: string }
  /** Data do servidor, AAAA-MM-DD. */
  today: string
  users: Record<'admin' | 'ana' | 'joao', LabUser>
  /** Número da caixa → id. */
  boxes: Record<string, string>
  /** Número da caixa → id do serviço que o seed lançou nela. */
  movements: Record<string, string>
}

export interface LabUser {
  id: string
  name: string
  username: string
  password: string
}

export async function createLab(): Promise<Lab> {
  const context = await request.newContext()
  try {
    const response = await context.post(`${API_URL}/__e2e__/labs`)
    if (response.status() !== 201) throw new Error(`Não foi possível criar o laboratório: ${await response.text()}`)
    return await response.json()
  } finally {
    await context.dispose()
  }
}

const clockFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Segundos até a meia-noite do laboratório. */
export function secondsToMidnight(): number {
  const parts = Object.fromEntries(clockFormat.formatToParts(new Date()).map((part) => [part.type, Number(part.value)]))
  return 24 * 3600 - (parts.hour * 3600 + parts.minute * 60 + parts.second)
}

/** `2026-11-23` + 1 → `2026-11-24`. */
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** `2026-11-23` → `23/11`. */
export function dayMonth(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`
}

/** O instante de uma hora local do laboratório (fuso -03:00; o Brasil está sem horário de verão). */
export function localInstant(date: string, time: string): string {
  return new Date(`${date}T${time}:00-03:00`).toISOString()
}
