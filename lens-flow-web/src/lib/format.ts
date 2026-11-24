/**
 * Datas e horas na tela. Instantes vêm em UTC e aparecem no fuso da empresa
 * (`America/Sao_Paulo`). Datas de folha (`AAAA-MM-DD`) nunca passam pelo
 * relógio do aparelho: a referência de "hoje" é sempre o `serverDate` (R4).
 */
const TIME_ZONE = 'America/Sao_Paulo'

const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const dayMonthFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' })
const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function parseDate(date: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null
}

/** Dias de calendário entre duas datas `AAAA-MM-DD` (`to - from`). */
export function daysBetween(from: string, to: string): number {
  const a = parseDate(from)
  const b = parseDate(to)
  if (!a || !b) return 0
  return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86_400_000)
}

/** `2026-11-23` → `23/11`. */
export function formatDayMonth(date: string): string {
  const parts = parseDate(date)
  return parts ? `${String(parts[2]).padStart(2, '0')}/${String(parts[1]).padStart(2, '0')}` : date
}

/** `2026-11-23` → `23/11/2026`. */
export function formatFullDate(date: string): string {
  const parts = parseDate(date)
  return parts ? `${formatDayMonth(date)}/${parts[0]}` : date
}

/** `2026-11-23` → `segunda-feira`. */
export function weekday(date: string): string {
  const parts = parseDate(date)
  if (!parts) return ''
  return WEEKDAYS[new Date(Date.UTC(parts[0], parts[1] - 1, parts[2])).getUTCDay()]
}

/** "Hoje", "Ontem" ou "sexta-feira", relativo à data do servidor. */
export function relativeDayLabel(date: string, serverDate: string | undefined): string {
  if (!serverDate) return formatDayMonth(date)
  const diff = daysBetween(date, serverDate)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Ontem'
  const name = weekday(date)
  if (diff > 1 && diff < 7) return name.charAt(0).toUpperCase() + name.slice(1)
  return diff >= 7 ? `Há ${diff} dias` : formatDayMonth(date)
}

/** Instante → `08:12`, no fuso da empresa. */
export function formatTime(instant: string): string {
  return timeFormat.format(new Date(instant))
}

/** Instante → `23/11 08:12`. */
export function formatDayTime(instant: string): string {
  return `${dayMonthFormat.format(new Date(instant))} ${formatTime(instant)}`
}

/** "aberto hoje", "aberto há 1 dia", "aberto há 3 dias". */
export function daysOpenLabel(daysOpen: number | null): string {
  if (daysOpen === null) return ''
  if (daysOpen <= 0) return 'aberto hoje'
  return daysOpen === 1 ? 'aberto há 1 dia' : `aberto há ${daysOpen} dias`
}

/** "1 serviço", "3 serviços". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
