import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Save, Wrench } from 'lucide-react'
import { ApiError, normalizeApiError, type Box, type FieldErrors, type Movement, type MovementWarning } from '@/lib/api'
import { useDraft } from '@/lib/draft/useDraft'
import { formatDayMonth } from '@/lib/format'
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

export interface MovementForm {
  boxNumber: string
  clientName: string
  orderService: string
  note: string
}

/** Lançamento que não entrou: fica guardado até a pessoa corrigir (nada se perde). */
interface FailedEntry {
  requestId: string
  form: MovementForm
  message: string
  fields: FieldErrors
  /** Falha de rede ou do servidor: a mesma chave evita lançar duas vezes (R13). */
  sameRequest: boolean
}

const EMPTY_FORM: MovementForm = { boxNumber: '', clientName: '', orderService: '', note: '' }
const FIELD_ORDER: Array<keyof MovementForm> = ['boxNumber', 'clientName', 'orderService', 'note']

function isEmpty(form: MovementForm): boolean {
  return FIELD_ORDER.every((field) => !form[field].trim())
}

/** As regras do zod do backend (contrato 1.2 e 5.2), antes de enviar. */
function validateMovementForm(form: MovementForm, box: Box | null | undefined): FieldErrors {
  const errors: FieldErrors = {}
  const boxError = validateBoxNumber(form.boxNumber)
  if (boxError) errors.boxNumber = boxError
  else if (box === null) errors.boxNumber = `Não existe caixa ${form.boxNumber}. Confira o número na etiqueta.`
  else if (box) {
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
  const queryClient = useQueryClient()
  const toast = useToast()
  const [searchParams] = useSearchParams()
  useToastBottomOffset(72)

  const [form, setForm, clearForm] = useDraft<MovementForm>('new-movement', {
    ...EMPTY_FORM,
    boxNumber: searchParams.get('caixa')?.replace(/\D/g, '') ?? '',
  })
  const [failed, setFailed] = useDraft<FailedEntry[]>('new-movement-failed', [])
  const [errors, setErrors] = useState<FieldErrors>({})
  const [sending, setSending] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const lastSubmitAt = useRef(0)
  // A mesma chave para reenviar o mesmo lançamento depois de falha de rede.
  const retryRequestId = useRef<string | null>(null)

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
    refs.boxNumber.current?.focus()
    // Só ao abrir a tela.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update(field: keyof MovementForm, value: string) {
    setForm({ ...form, [field]: value })
    if (errors[field]) setErrors({ ...errors, [field]: '' })
    if (field === 'boxNumber') retryRequestId.current = null
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
        const boxError = validateMovementForm(form, lookupBox).boxNumber
        if (boxError) {
          setErrors({ ...errors, boxNumber: boxError })
          return
        }
      }
      focusNext(field)
    }
  }

  async function resolveBox(number: string): Promise<Box | null> {
    return queryClient.fetchQuery({
      queryKey: boxKeys.byNumber(number),
      queryFn: ({ signal }) => fetchBoxByNumber(number, signal),
      staleTime: 0,
    })
  }

  /** Envia um lançamento. Lança `ApiError` se não entrou. */
  async function send(entry: MovementForm, requestId: string) {
    const box = await resolveBox(entry.boxNumber)
    if (!box) {
      throw new ApiError({
        code: 'NOT_FOUND',
        message: `Não existe caixa ${entry.boxNumber}.`,
        fields: { boxId: `Não existe caixa ${entry.boxNumber}. Confira o número na etiqueta.` },
      })
    }
    const availability = boxAvailability(box)
    if (availability.kind !== 'free') {
      throw new ApiError({ code: 'BOX_OCCUPIED', message: availability.reason, fields: { boxId: `${availability.reason} Escolha outra caixa.` } })
    }
    const result = await createMovement({
      boxId: box.id,
      clientName: entry.clientName.trim(),
      orderService: entry.orderService.trim() || undefined,
      note: entry.note.trim() || undefined,
      clientRequestId: requestId,
    })
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
    if (finishing) return
    if (mode === 'finish' && isEmpty(form)) {
      navigate('/hoje')
      return
    }
    const now = Date.now()
    // Toque duplo: o segundo chega com o formulário já vazio.
    if (isEmpty(form) && now - lastSubmitAt.current < 1_500) return

    const fieldErrors = validateMovementForm(form, lookupBox)
    if (Object.values(fieldErrors).some(Boolean)) {
      setErrors(fieldErrors)
      focusFirstError(fieldErrors)
      return
    }

    lastSubmitAt.current = now
    const entry = form
    const requestId = retryRequestId.current ?? newRequestId()
    retryRequestId.current = null
    setErrors({})

    if (mode === 'finish') {
      // "Concluir": espera a resposta e só sai se entrou.
      setFinishing(true)
      send(entry, requestId)
        .then(({ movement, warnings }) => {
          clearForm()
          showLaunched(movement, warnings)
          navigate('/hoje')
        })
        .catch((error: unknown) => {
          const apiError = normalizeApiError(error)
          const fields = fieldErrorsFrom(apiError)
          if (apiError.isNetworkError || (apiError.status ?? 0) >= 500) retryRequestId.current = requestId
          setErrors(fields)
          toast.show({ tone: 'error', message: `Não foi lançado. ${apiError.message}` })
          focusFirstError(fields)
        })
        .finally(() => setFinishing(false))
      return
    }

    // "Salvar e próximo" (R3): limpa e devolve o foco à caixa no mesmo toque;
    // o envio segue em segundo plano. Se falhar, o lançamento fica guardado.
    clearForm()
    refs.boxNumber.current?.focus()
    setSending((count) => count + 1)
    send(entry, requestId)
      .then(({ movement, warnings }) => showLaunched(movement, warnings))
      .catch((error: unknown) => {
        const apiError = normalizeApiError(error)
        const failure: FailedEntry = {
          requestId,
          form: entry,
          message: apiError.message,
          fields: fieldErrorsFrom(apiError),
          sameRequest: apiError.isNetworkError || (apiError.status ?? 0) >= 500,
        }
        setFailed((current) => [...current, failure])
        toast.show({
          tone: 'error',
          duration: null,
          message: `Caixa ${entry.boxNumber} (${entry.clientName.trim()}) não foi lançada. ${apiError.message}`,
          action: { label: 'Corrigir', onClick: () => restore(failure.requestId) },
        })
      })
      .finally(() => setSending((count) => count - 1))
  }

  // Usa o estado mais recente: pode ser chamado de um aviso antigo.
  const stateRef = useRef({ form, failed })
  stateRef.current = { form, failed }

  function restore(requestId: string) {
    const { form: current, failed: list } = stateRef.current
    const entry = list.find((item) => item.requestId === requestId)
    if (!entry) return
    const rest = list.filter((item) => item.requestId !== requestId)
    // O que estava no formulário não se perde: troca de lugar com o que volta.
    const parked: FailedEntry[] = isEmpty(current)
      ? []
      : [
          {
            requestId: newRequestId(),
            form: current,
            message: 'Rascunho guardado enquanto você corrigia outro lançamento.',
            fields: {},
            sameRequest: false,
          },
        ]
    setFailed([...rest, ...parked])
    setForm(entry.form)
    setErrors(entry.fields)
    retryRequestId.current = entry.sameRequest ? entry.requestId : null
    window.setTimeout(() => focusFirstError(Object.keys(entry.fields).length ? entry.fields : { boxNumber: 'x' }), 0)
  }

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

      {failed.length > 0 && (
        <section className="mb-4 flex flex-col gap-2" aria-label="Lançamentos para corrigir">
          {failed.map((entry) => (
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

      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Novo serviço">
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

        <div aria-hidden="true" className="h-16 md:hidden" />
        <div className="fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-20 flex gap-2 border-t border-line bg-canvas/95 px-4 py-2 backdrop-blur md:static md:border-0 md:bg-transparent md:px-0 md:py-0">
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
        {sending > 0 && (
          <p role="status" className="flex items-center gap-1.5 text-sm text-ink-muted">
            <Spinner className="size-4" />
            Enviando {sending === 1 ? '1 lançamento' : `${sending} lançamentos`}…
          </p>
        )}
      </form>
    </section>
  )
}
