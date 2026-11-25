import { useMemo } from 'react'
import type { ApiError, FieldErrors } from '@/lib/api'
import { draftStorageKey, readDraft, writeDraft } from '@/lib/draft/drafts'
import { useDraft } from '@/lib/draft/useDraft'

export const NEW_MOVEMENT_PATH = '/servicos/novo'

/** Estado da rota de "Novo serviço": qual lançamento guardado abrir para corrigir. */
export interface NewMovementLocationState {
  fix?: string
  /** Levar o foco à lista de lançamentos para corrigir. */
  showToFix?: boolean
}

export interface MovementForm {
  boxNumber: string
  clientName: string
  orderService: string
  note: string
}

export const EMPTY_FORM: MovementForm = { boxNumber: '', clientName: '', orderService: '', note: '' }

export function isEmpty(form: MovementForm): boolean {
  return Object.values(form).every((value) => !value.trim())
}

export interface LaunchFailure {
  message: string
  fields: FieldErrors
  /** Pode ter entrado sem a resposta chegar: a mesma chave evita lançar duas vezes (R13). */
  sameRequest: boolean
}

/**
 * Lançamento guardado por usuário, como rascunho (R17), desde o toque em
 * "Salvar e próximo" até entrar: nada se perde se a pessoa sair da tela, a
 * página recarregar ou a sessão terminar no meio do envio. "Sair" apaga.
 */
export interface OutboxEntry extends LaunchFailure {
  requestId: string
  form: MovementForm
  /** `parked`: rascunho que deu lugar a outro lançamento no formulário. */
  status: 'sending' | 'failed' | 'parked'
  /** O `parked` já tinha sido enviado, e não só digitado. */
  sent?: boolean
}

/**
 * A última tentativa do que está no formulário: "Concluir", ou um lançamento
 * que voltou para corrigir. Sem tentativa, é só um rascunho digitado.
 */
export interface FormAttempt {
  requestId: string
  status: 'sending' | 'failed'
  sameRequest: boolean
}

export const SESSION_ENDED_MESSAGE =
  'A sessão terminou antes de o lançamento ser confirmado. Corrija e salve de novo: ele não entra duas vezes.'
const INTERRUPTED_MESSAGE = 'O envio foi interrompido. Corrija e salve de novo: ele não entra duas vezes.'

export const FORM_KEY = 'new-movement'
export const ATTEMPT_KEY = 'new-movement-attempt'
const OUTBOX_KEY = 'new-movement-failed'
const NO_ENTRIES: OutboxEntry[] = []

/** Envios em andamento nesta página. Depois de recarregar, o que ficou "enviando" foi interrompido. */
const inFlight = new Set<string>()

export function startFlight(requestId: string): void {
  inFlight.add(requestId)
}

export function endFlight(requestId: string): void {
  inFlight.delete(requestId)
}

export function isInFlight(requestId: string): boolean {
  return inFlight.has(requestId)
}

function readOutbox(userId: string): OutboxEntry[] {
  return readDraft(draftStorageKey(userId, OUTBOX_KEY), NO_ENTRIES)
}

function writeOutbox(userId: string, entries: OutboxEntry[]): void {
  writeDraft(draftStorageKey(userId, OUTBOX_KEY), entries)
}

export function isInOutbox(userId: string, requestId: string): boolean {
  return readOutbox(userId).some((entry) => entry.requestId === requestId)
}

export function putInOutbox(userId: string, entry: OutboxEntry): void {
  writeOutbox(userId, [...readOutbox(userId).filter((item) => item.requestId !== entry.requestId), entry])
}

export function startSending(userId: string, requestId: string, form: MovementForm): void {
  startFlight(requestId)
  putInOutbox(userId, { requestId, form, status: 'sending', message: INTERRUPTED_MESSAGE, fields: {}, sameRequest: true })
}

/** Tira o lançamento do guardado: entrou, ou voltou para o formulário. */
export function removeFromOutbox(userId: string, requestId: string): void {
  if (!isInOutbox(userId, requestId)) return
  writeOutbox(
    userId,
    readOutbox(userId).filter((entry) => entry.requestId !== requestId),
  )
}

/** Só marca o que ainda está guardado: "Sair" apaga, e o que falha depois não volta. */
export function markFailed(userId: string, requestId: string, failure: LaunchFailure): void {
  if (!isInOutbox(userId, requestId)) return
  writeOutbox(
    userId,
    readOutbox(userId).map((entry) => (entry.requestId === requestId ? { ...entry, ...failure, status: 'failed' } : entry)),
  )
}

/** Só uma recusa definitiva garante que não entrou; nos outros casos, a chave se mantém. */
export function launchFailure(error: ApiError, fields: FieldErrors): LaunchFailure {
  if (error.status === 401) return { message: SESSION_ENDED_MESSAGE, fields, sameRequest: true }
  const unknownOutcome = error.isNetworkError || error.code === 'INTERNAL' || (error.status ?? 0) >= 500
  return { message: error.message, fields, sameRequest: unknownOutcome }
}

/** Os lançamentos guardados do usuário atual. */
export function useLaunchOutbox() {
  const [entries] = useDraft<OutboxEntry[]>(OUTBOX_KEY, NO_ENTRIES)
  return useMemo(() => {
    const isSending = (entry: OutboxEntry) => entry.status === 'sending' && isInFlight(entry.requestId)
    return { sending: entries.filter(isSending), toFix: entries.filter((entry) => !isSending(entry)) }
  }, [entries])
}

export interface PendingLaunches {
  /** Recusados: não entraram. */
  refused: number
  /** Sem resposta (rede, recarga, fim de sessão): podem ou não ter entrado. */
  unconfirmed: number
  /** Em envio: ainda podem ou não entrar. */
  sending: number
}

/** O que "Sair" apagaria e já foi enviado (D27). O que só foi digitado não conta. */
export function usePendingLaunches(): PendingLaunches {
  const [entries] = useDraft<OutboxEntry[]>(OUTBOX_KEY, NO_ENTRIES)
  const [attempt] = useDraft<FormAttempt | null>(ATTEMPT_KEY, null)
  const [form] = useDraft<MovementForm>(FORM_KEY, EMPTY_FORM)

  return useMemo(() => {
    const launches: Array<Pick<OutboxEntry, 'requestId' | 'sameRequest'>> = entries.filter(
      (entry) => entry.status !== 'parked' || entry.sent,
    )
    if (attempt && !isEmpty(form)) launches.push(attempt)

    const pending: PendingLaunches = { refused: 0, unconfirmed: 0, sending: 0 }
    for (const { requestId, sameRequest } of launches) {
      if (isInFlight(requestId)) pending.sending += 1
      else if (sameRequest) pending.unconfirmed += 1
      else pending.refused += 1
    }
    return pending
  }, [entries, attempt, form])
}
