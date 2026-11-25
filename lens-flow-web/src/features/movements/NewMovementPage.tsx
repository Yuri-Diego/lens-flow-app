import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Save, Wrench } from 'lucide-react'
import { ApiError, normalizeApiError, type Box, type FieldErrors, type Movement, type MovementWarning, type SessionUser } from '@/lib/api'
import { ME_QUERY_KEY, useAuth } from '@/lib/auth/AuthProvider'
import { draftStorageKey, readDraft } from '@/lib/draft/drafts'
import { useDraft } from '@/lib/draft/useDraft'
import { formatDayMonth, plural } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { useToast, useToastBottomOffset } from '@/components/ui/Toast'
import { boxKeys, fetchBoxByNumber, validateBoxNumber } from '@/features/boxes/api'
import { boxAvailability, useBoxLookup } from '@/features/boxes/boxAvailability'
import { BoxLookupResult } from '@/features/boxes/BoxLookupResult'
import { ClientNameField } from '@/features/clients/ClientNameField'
import {
  createMovement,
  deleteMovement,
  fetchMovements,
  fetchSummary,
  movementKeys,
  newRequestId,
} from './api'
import {
  ATTEMPT_KEY,
  EMPTY_FORM,
  FORM_KEY,
  SESSION_ENDED_MESSAGE,
  endFlight,
  isEmpty,
  isInFlight,
  isInOutbox,
  launchFailure,
  markFailed,
  putInOutbox,
  removeFromOutbox,
  startFlight,
  startSending,
  useLaunchOutbox,
  type FormAttempt,
  type MovementForm,
  type NewMovementLocationState,
} from './launchOutbox'

const FIELD_ORDER: Array<keyof MovementForm> = ['boxNumber', 'clientName', 'orderService', 'note']

function sameForm(a: MovementForm, b: MovementForm): boolean {
  return FIELD_ORDER.every((field) => a[field] === b[field])
}

/**
 * As regras do zod do backend (contrato 1.2 e 5.2), antes de enviar. No reenvio
 * (R13), a caixa pode estar ocupada pelo próprio lançamento: quem diz é a API.
 */
function validateMovementForm(form: MovementForm, box: Box | null | undefined, isRetry: boolean): FieldErrors {
  const errors: FieldErrors = {}
  const boxError = validateBoxNumber(form.boxNumber)
  if (boxError) errors.boxNumber = boxError
  else if (box === null) errors.boxNumber = `Não existe caixa ${form.boxNumber}. Confira o número na etiqueta.`
  else if (box && !isRetry) {
    const availability = boxAvailability(box)
    if (availability.kind !== 'free') errors.boxNumber = `${availability.reason} Escolha outra caixa.`
  }
  const client = form.clientName.trim()
  if (!client) errors.clientName = 'Informe o cliente.'
  else if (client.length > 120) errors.clientName = 'O cliente pode ter no máximo 120 caracteres.'
  if (form.orderService.trim().length > 40) errors.orderService = 'A OS pode ter no máximo 40 caracteres.'
  if (form.note.trim().length > 500) errors.note = 'A observação pode ter no máximo 500 caracteres.'
  return errors
}

/** Erro da API → erro por campo do formulário. */
function fieldErrorsFrom(error: ApiError): FieldErrors {
  const fields: FieldErrors = {}
  if (error.fields.boxId) fields.boxNumber = error.fields.boxId
  for (const key of ['clientName', 'orderService', 'note'] as const) {
    if (error.fields[key]) fields[key] = error.fields[key]
  }
  if ((error.code === 'BOX_OCCUPIED' || error.code === 'CONFLICT' || error.code === 'NOT_FOUND') && !fields.boxNumber) {
    fields.boxNumber = `${error.message} Escolha outra caixa.`
  }
  return fields
}

function duplicateOsMessage(orderService: string, items: Movement[]): string {
  const where = items.map(
    (item) => `caixa ${item.box.number} (${item.box.colorLabel}), aberta desde ${formatDayMonth(item.sheetDate)}`,
  )
  return items.length === 1
    ? `A OS ${orderService} já está na ${where[0]}.`
    : `A OS ${orderService} já está em outros serviços abertos: ${where.join('; ')}.`
}

function warningsText(warnings: MovementWarning[]): string {
  return warnings.map((warning) => warning.message).join(' ')
}

export function NewMovementPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  useToastBottomOffset(72)

  const [form, setForm, clearForm] = useDraft<MovementForm>(FORM_KEY, {
    ...EMPTY_FORM,
    boxNumber: searchParams.get('caixa')?.replace(/\D/g, '') ?? '',
  })
  const [attempt, setAttempt] = useDraft<FormAttempt | null>(ATTEMPT_KEY, null)
  const finishing = attempt?.status === 'sending' && isInFlight(attempt.requestId)
  // A chave do lançamento no formulário, para reenviar o mesmo sem lançar duas vezes (R13).
  const requestKey = attempt?.sameRequest ? attempt.requestId : null
  const { sending, toFix } = useLaunchOutbox()
  const [errors, setErrors] = useState<FieldErrors>({})
  const lastSubmitAt = useRef(0)
  const mounted = useRef(true)
  const toFixRef = useRef<HTMLElement>(null)

  const refs: Record<keyof MovementForm, RefObject<HTMLInputElement | null>> = {
    boxNumber: useRef<HTMLInputElement>(null),
    clientName: useRef<HTMLInputElement>(null),
    orderService: useRef<HTMLInputElement>(null),
    note: useRef<HTMLInputElement>(null),
  }

  const summary = useQuery({ queryKey: movementKeys.summary(), queryFn: fetchSummary })
  const lookup = useBoxLookup(form.boxNumber)
  const lookupBox = validateBoxNumber(form.boxNumber) === null ? lookup.data : undefined

  const orderService = useDebouncedValue(form.orderService.trim(), 350)
  const duplicates = useQuery({
    queryKey: movementKeys.list({ status: 'open', orderService, limit: 5 }),
    queryFn: ({ signal }) => fetchMovements({ status: 'open', orderService, limit: 5 }, signal),
    enabled: orderService.length > 0 && orderService.length <= 40,
    staleTime: 5_000,
  })
  const duplicateItems = orderService === form.orderService.trim() ? (duplicates.data?.items ?? []) : []

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    refs.boxNumber.current?.focus()
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(field: keyof MovementForm, value: string) {
    const next = { ...form, [field]: value }
    setForm(next)
    if (errors[field]) setErrors({ ...errors, [field]: '' })
    if (!attempt || finishing) return
    // Apagou tudo: o que vier é outro lançamento. Trocou a caixa: outra chave.
    if (isEmpty(next)) setAttempt(null)
    else if (field === 'boxNumber') setAttempt({ ...attempt, sameRequest: false })
  }

  function focusNext(field: keyof MovementForm) {
    const next = FIELD_ORDER[FIELD_ORDER.indexOf(field) + 1]
    if (next) refs[next].current?.focus()
  }

  function onEnter(field: keyof MovementForm) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
      event.preventDefault()
      if (field === 'note') {
        submit('next')
        return
      }
      if (field === 'boxNumber') {
        const boxError = validateMovementForm(form, lookupBox, requestKey !== null).boxNumber
        if (boxError) {
          setErrors({ ...errors, boxNumber: boxError })
          return
        }
      }
      focusNext(field)
    }
  }

  function isSessionOf(userId: string): boolean {
    return queryClient.getQueryData<SessionUser | null>(ME_QUERY_KEY)?.id === userId
  }

  /**
   * Envia um lançamento. Lança `ApiError` se não entrou. Não envia o que "Sair"
   * apagou nem, depois de trocar de usuário, em nome de outra pessoa.
   */
  async function send(userId: string, entry: MovementForm, requestId: string, isRetry: boolean, isKept: () => boolean) {
    // Direto na API: a busca da tela é cancelada quando o número sai do campo.
    const box = await fetchBoxByNumber(entry.boxNumber)
    if (!isSessionOf(userId) || !isKept()) throw new ApiError({ code: 'UNAUTHENTICATED', status: 401, message: SESSION_ENDED_MESSAGE })
    queryClient.setQueryData<Box | null>(boxKeys.byNumber(entry.boxNumber), box)
    if (!box) {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: `Não existe caixa ${entry.boxNumber}.`,
        fields: { boxId: `Não existe caixa ${entry.boxNumber}. Confira o número na etiqueta.` },
      })
    }
    const availability = boxAvailability(box)
    if (availability.kind !== 'free' && !isRetry) {
      throw new ApiError({ code: 'BOX_OCCUPIED', message: availability.reason, fields: { boxId: `${availability.reason} Escolha outra caixa.` } })
    }
    const result = await createMovement({
      boxId: box.id,
      clientName: entry.clientName.trim(),
      orderService: entry.orderService.trim() || undefined,
      note: entry.note.trim() || undefined,
      clientRequestId: requestId,
    })
    if (!isSessionOf(userId)) return result
    // A caixa agora está ocupada: a próxima busca pelo número já mostra isso.
    const occupied: Box = {
      ...box,
      state: 'occupied',
      currentMovement: {
        id: result.movement.id,
        clientName: result.movement.clientName,
        orderService: result.movement.orderService,
        status: 'open',
        sheetDate: result.movement.sheetDate,
        createdAt: result.movement.createdAt,
        createdBy: result.movement.createdBy,
      },
    }
    queryClient.setQueryData<Box | null>(boxKeys.byNumber(box.number), occupied)
    void queryClient.invalidateQueries({ queryKey: movementKeys.all })
    void queryClient.invalidateQueries({ queryKey: boxKeys.all, refetchType: 'none' })
    return result
  }

  function showLaunched(movement: Movement, warnings: MovementWarning[]) {
    const base = `Lançado na caixa ${movement.box.number}: ${movement.clientName}.`
    toast.show({
      message: warnings.length ? `${base} ${warningsText(warnings)}` : base,
      tone: 'success',
      action: { label: 'Desfazer', onClick: () => void undoLaunch(movement) },
    })
  }

  async function undoLaunch(movement: Movement) {
    try {
      await deleteMovement(movement.id)
      queryClient.removeQueries({ queryKey: boxKeys.byNumber(movement.box.number) })
      void queryClient.invalidateQueries({ queryKey: movementKeys.all })
      toast.show({ message: `Lançamento desfeito. A caixa ${movement.box.number} está livre de novo.` })
    } catch (error) {
      toast.show({ tone: 'error', message: `Não foi possível desfazer. ${normalizeApiError(error).message}` })
    }
  }

  function focusFirstError(fieldErrors: FieldErrors) {
    const first = FIELD_ORDER.find((field) => fieldErrors[field])
    if (first) refs[first].current?.focus()
  }

  function submit(mode: 'next' | 'finish') {
    if (finishing || !user) return
    if (mode === 'finish' && isEmpty(form)) {
      navigate('/hoje')
      return
    }
    const now = Date.now()
    // Toque duplo: o segundo chega com o formulário já vazio.
    if (isEmpty(form) && now - lastSubmitAt.current < 1_500) return

    const fieldErrors = validateMovementForm(form, lookupBox, requestKey !== null)
    if (Object.values(fieldErrors).some(Boolean)) {
      setErrors(fieldErrors)
      focusFirstError(fieldErrors)
      return
    }

    lastSubmitAt.current = now
    const userId = user.id
    const entry = form
    const isRetry = requestKey !== null
    const requestId = requestKey ?? newRequestId()
    setErrors({})

    if (mode === 'finish') {
      finish(userId, entry, requestId, isRetry)
      return
    }

    // "Salvar e próximo" (R3): limpa e devolve o foco à caixa no mesmo toque;
    // o envio segue em segundo plano. Até entrar, o lançamento fica guardado.
    startSending(userId, requestId, entry)
    clearForm()
    setAttempt(null)
    refs.boxNumber.current?.focus()
    send(userId, entry, requestId, isRetry, () => isInOutbox(userId, requestId))
      .finally(() => endFlight(requestId))
      .then(({ movement, warnings }) => {
        removeFromOutbox(userId, requestId)
        showLaunched(movement, warnings)
      })
      .catch((error: unknown) => {
        const apiError = normalizeApiError(error)
        markFailed(userId, requestId, launchFailure(apiError, fieldErrorsFrom(apiError)))
      })
  }

  /** "Concluir": espera a resposta e só sai se entrou. Até lá, o lançamento fica no formulário. */
  function finish(userId: string, entry: MovementForm, requestId: string, isRetry: boolean) {
    const isInForm = () =>
      readDraft<FormAttempt | null>(draftStorageKey(userId, ATTEMPT_KEY), null)?.requestId === requestId
    const isOnScreen = () => mounted.current && isSessionOf(userId)
    const currentForm = () => readDraft(draftStorageKey(userId, FORM_KEY), EMPTY_FORM)

    startFlight(requestId)
    setAttempt({ requestId, status: 'sending', sameRequest: true })
    send(userId, entry, requestId, isRetry, () => isInForm() || isInOutbox(userId, requestId))
      .finally(() => endFlight(requestId))
      .then(({ movement, warnings }) => {
        if (isInForm()) {
          // O que foi digitado durante o envio fica, como rascunho.
          if (sameForm(currentForm(), entry)) clearForm()
          setAttempt(null)
        }
        removeFromOutbox(userId, requestId)
        showLaunched(movement, warnings)
        if (isOnScreen()) navigate('/hoje')
      })
      .catch((error: unknown) => {
        const apiError = normalizeApiError(error)
        const failure = launchFailure(apiError, fieldErrorsFrom(apiError))
        const inForm = isInForm()
        const form = currentForm()
        if (inForm && !isOnScreen() && sameForm(form, entry)) {
          // Já saiu da tela: espera a correção na lista.
          clearForm()
          setAttempt(null)
          putInOutbox(userId, { requestId, form: entry, status: 'failed', ...failure })
        } else {
          // Outro lançamento pode ter tomado o lugar dele no formulário.
          markFailed(userId, requestId, failure)
        }
        if (isInOutbox(userId, requestId)) return

        toast.show({ tone: 'error', message: `Não foi lançado. ${failure.message}` })
        if (!inForm) return
        setAttempt({ requestId, status: 'failed', sameRequest: failure.sameRequest && form.boxNumber === entry.boxNumber })
        if (isOnScreen()) {
          setErrors(failure.fields)
          focusFirstError(failure.fields)
        }
      })
  }

  function restore(requestId: string) {
    const entry = toFix.find((item) => item.requestId === requestId)
    if (!user || !entry || !isInOutbox(user.id, requestId)) return
    removeFromOutbox(user.id, requestId)
    // O que estava no formulário não se perde: troca de lugar com o que volta.
    if (!isEmpty(form)) {
      putInOutbox(user.id, {
        requestId: attempt?.requestId ?? newRequestId(),
        form,
        status: 'parked',
        sent: attempt !== null,
        message: 'Rascunho guardado enquanto você corrigia outro lançamento.',
        fields: {},
        sameRequest: requestKey !== null,
      })
    }
    setForm(entry.form)
    setErrors(entry.fields)
    // O que só foi digitado volta como rascunho; o já enviado, com a chave dele.
    setAttempt(
      entry.status === 'parked' && !entry.sent
        ? null
        : { requestId, status: isInFlight(requestId) ? 'sending' : 'failed', sameRequest: entry.sameRequest },
    )
    window.setTimeout(() => focusFirstError(Object.keys(entry.fields).length ? entry.fields : { boxNumber: 'x' }), 0)
  }

  // "Corrigir" no aviso, de qualquer tela, chega aqui pelo estado da rota.
  const { fix, showToFix } = (location.state as NewMovementLocationState | null) ?? {}
  useEffect(() => {
    if (!fix && !showToFix) return
    if (fix) restore(fix)
    if (showToFix) {
      toFixRef.current?.scrollIntoView?.({ block: 'center' })
      toFixRef.current?.focus()
    }
    navigate(location.pathname, { replace: true, state: null })
    // Só quando chega um pedido pela rota.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fix, showToFix])

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit('next')
  }

  const serverDate = summary.data?.serverDate

  return (
    <section>
      <PageHeader
        title="Novo serviço"
        description={serverDate ? `Na folha de hoje, ${formatDayMonth(serverDate)}.` : 'Na folha de hoje.'}
      />

      {toFix.length > 0 && (
        <section
          ref={toFixRef}
          tabIndex={-1}
          className="mb-4 flex flex-col gap-2 outline-none"
          aria-label="Lançamentos para corrigir"
        >
          {toFix.map((entry) => (
            <Alert
              key={entry.requestId}
              tone="error"
              title={`Caixa ${entry.form.boxNumber || '—'} · ${entry.form.clientName.trim() || 'sem cliente'}: não foi lançada`}
              action={
                <Button
                  variant="secondary"
                  onClick={() => restore(entry.requestId)}
                  icon={<Wrench aria-hidden="true" className="size-4" />}
                >
                  Corrigir
                </Button>
              }
            >
              {entry.message}
            </Alert>
          ))}
        </section>
      )}

      <form
        noValidate
        onSubmit={onSubmit}
        aria-label="Novo serviço"
        // No computador, o campo com foco rola até ficar acima da barra fixa.
        className="flex flex-col gap-4 md:[&_input]:scroll-mb-24"
      >
        <div>
          <TextField
            ref={refs.boxNumber}
            label="Caixa"
            name="boxNumber"
            value={form.boxNumber}
            onChange={(event) => update('boxNumber', event.target.value.replace(/\D/g, ''))}
            onKeyDown={onEnter('boxNumber')}
            error={errors.boxNumber || undefined}
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="next"
            autoComplete="off"
            maxLength={6}
            placeholder="Número da etiqueta"
            className="[&_input]:font-mono [&_input]:text-2xl [&_input]:tabular-nums"
            trailing={
              <button
                type="button"
                onClick={() => refs.clientName.current?.focus()}
                aria-label="Próximo campo"
                className="focus-ring mr-1 flex size-touch items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted hover:text-ink"
              >
                <ArrowRight aria-hidden="true" className="size-5" />
              </button>
            }
          />
          <BoxLookupResult
            id="box-lookup"
            number={validateBoxNumber(form.boxNumber) === null ? form.boxNumber : ''}
            box={lookupBox}
            isLoading={lookup.isFetching && lookup.data === undefined}
            error={lookup.error}
            onPickFree={() => refs.clientName.current?.focus()}
          />
        </div>

        <ClientNameField
          ref={refs.clientName}
          label="Cliente"
          name="clientName"
          value={form.clientName}
          onValueChange={(value) => update('clientName', value)}
          onPick={() => focusNext('clientName')}
          onKeyDown={onEnter('clientName')}
          error={errors.clientName || undefined}
          enterKeyHint="next"
          autoCapitalize="words"
          autoComplete="off"
          spellCheck={false}
          maxLength={120}
        />

        <div>
          <TextField
            ref={refs.orderService}
            label="OS (opcional)"
            name="orderService"
            value={form.orderService}
            onChange={(event) => update('orderService', event.target.value)}
            onKeyDown={onEnter('orderService')}
            error={errors.orderService || undefined}
            enterKeyHint="next"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={40}
          />
          {duplicateItems.length > 0 && (
            <Alert tone="warning" className="mt-2" title="OS repetida">
              {duplicateOsMessage(orderService, duplicateItems)} Você pode lançar mesmo assim.
            </Alert>
          )}
        </div>

        <TextField
          ref={refs.note}
          label="Observação (opcional)"
          name="note"
          value={form.note}
          onChange={(event) => update('note', event.target.value)}
          onKeyDown={onEnter('note')}
          error={errors.note || undefined}
          enterKeyHint="send"
          autoComplete="off"
          maxLength={500}
        />

        {sending.length > 0 && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Spinner className="size-4" />
            Enviando {plural(sending.length, 'lançamento')}…
          </p>
        )}

        {/* Fixa também no computador: o aviso fica sempre acima dela, em qualquer altura de janela. */}
        <div aria-hidden="true" className="h-16" />
        <div className="fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-20 border-t border-line bg-canvas/95 py-2 backdrop-blur md:bottom-0 md:left-64 md:pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-5xl gap-2 px-4 md:px-8">
            <Button
              variant="secondary"
              size="lg"
              onClick={() => submit('finish')}
              loading={finishing}
              loadingText="Salvando…"
            >
              Concluir
            </Button>
            <Button type="submit" size="lg" className="flex-1" disabled={finishing} icon={<Save aria-hidden="true" className="size-5" />}>
              Salvar e próximo
            </Button>
          </div>
        </div>
      </form>
    </section>
  )
}
