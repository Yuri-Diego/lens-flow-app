import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { normalizeApiError, type Box, type BoxColor } from '@/lib/api'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { boxKeys, createBoxBatch, type BoxBatchResult } from './api'
import { BATCH_MAX_TEXT, parseBatchNumbers, previewBatch, type PreviewItem } from './batchNumbers'
import { BOX_CATEGORIES, BOX_COLORS } from './boxColors'
import { ColorPicker } from './ColorPicker'

const MAX_CHIPS = 120

/**
 * Cadastro em lote (RN-13): cor + números, com intervalos ("3, 12, 27-30").
 * A pré-visualização mostra o que vai ser criado antes de enviar, e o
 * resultado volta item a item (contrato 3.10).
 */
export function BoxBatchDialog({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: Box[] }) {
  const queryClient = useQueryClient()
  const numbersId = useId()
  const [color, setColor] = useState<BoxColor | null>(null)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<{ color?: string; numbers?: string; form?: string }>({})
  const [result, setResult] = useState<{ color: BoxColor; data: BoxBatchResult } | null>(null)

  // Espera a pessoa parar de digitar para não acusar "27-" no meio do intervalo.
  const debouncedText = useDebouncedValue(text, 300)
  const parsed = debouncedText.trim() ? parseBatchNumbers(debouncedText) : null
  const preview = parsed?.numbers ? previewBatch(parsed.numbers, existing) : []
  const toCreate = preview.filter((item) => item.status.kind === 'new').length
  const parseError = text === debouncedText ? parsed?.error : undefined

  const mutation = useMutation({
    mutationFn: (input: { color: BoxColor; numbers: string }) => createBoxBatch(input.color, input.numbers),
    onSuccess: (data, input) => {
      setResult({ color: input.color, data })
      void queryClient.invalidateQueries({ queryKey: boxKeys.all })
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      setErrors({
        color: apiError.fields.color,
        numbers: apiError.fields.numbers,
        form: apiError.fields.color || apiError.fields.numbers ? undefined : apiError.message,
      })
    },
  })

  function close() {
    if (mutation.isPending) return
    setText('')
    setErrors({})
    setResult(null)
    onClose()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const check = parseBatchNumbers(text)
    const next = {
      color: color ? undefined : 'Escolha a cor das caixas.',
      numbers: check.error,
    }
    setErrors(next)
    if (next.color || next.numbers || !color) return
    mutation.mutate({ color, numbers: text })
  }

  const colorInfo = color ? BOX_COLORS[color] : null

  if (result) {
    const { data } = result
    const created = data.results.filter((item) => item.ok)
    const failed = data.results.filter((item) => !item.ok)
    return (
      <Dialog
        open={open}
        title="Resultado do cadastro"
        onClose={close}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null)
                setText('')
              }}
            >
              Cadastrar mais
            </Button>
            <Button onClick={close}>Concluir</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Alert tone={failed.length ? 'warning' : 'success'} title={resultTitle(data)}>
            {BOX_COLORS[result.color].label} · {BOX_CATEGORIES[BOX_COLORS[result.color].category].label}
          </Alert>
          <ul aria-label="Resultado item a item" className="flex flex-col divide-y divide-line rounded-xl border border-line">
            {data.results.map((item, index) => (
              <li key={`${item.number}-${index}`} className="flex items-start gap-2 px-3 py-2 text-base">
                {item.ok ? (
                  <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-success" />
                ) : (
                  <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" />
                )}
                <span className="font-mono font-bold tabular-nums">{item.number}</span>
                <span className={item.ok ? 'text-success' : 'text-danger'}>
                  {item.ok ? 'criada' : (item.error?.message ?? 'não foi criada')}
                </span>
              </li>
            ))}
          </ul>
          {created.length === 0 && <p className="text-sm text-ink-muted">Nenhuma caixa foi criada. Confira os números e tente de novo.</p>}
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      title="Cadastrar caixas"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form={`${numbersId}-form`} loading={mutation.isPending} loadingText="Cadastrando…" disabled={!!parseError}>
            {toCreate > 0 && colorInfo ? `Cadastrar ${plural(toCreate, 'caixa')}` : 'Cadastrar'}
          </Button>
        </>
      }
    >
      <form id={`${numbersId}-form`} noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Cadastrar caixas">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <ColorPicker
          label="Cor"
          value={color}
          onChange={(next) => {
            setColor(next)
            setErrors((current) => ({ ...current, color: undefined }))
          }}
          error={errors.color}
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor={numbersId} className="text-sm font-semibold text-ink">
            Números
          </label>
          <textarea
            id={numbersId}
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setErrors((current) => ({ ...current, numbers: undefined, form: undefined }))
            }}
            rows={3}
            maxLength={BATCH_MAX_TEXT}
            autoComplete="off"
            spellCheck={false}
            placeholder="3, 12, 27-30"
            aria-invalid={errors.numbers || parseError ? true : undefined}
            aria-describedby={`${numbersId}-hint ${numbersId}-error`}
            className={cn(
              'focus-ring w-full rounded-xl border bg-surface px-3 py-2 font-mono text-base text-ink placeholder:text-ink-muted',
              errors.numbers || parseError ? 'border-danger' : 'border-line-strong',
            )}
          />
          <p id={`${numbersId}-hint`} className="text-sm text-ink-muted">
            Separe por vírgula ou espaço. Use hífen para intervalo: 27-30 cria 27, 28, 29 e 30. O zero à esquerda fica como na
            etiqueta: 007-010 cria 007 a 010.
          </p>
          <p id={`${numbersId}-error`} className="text-sm font-medium text-danger">
            {errors.numbers ?? parseError}
          </p>
        </div>

        {preview.length > 0 && <BatchPreview items={preview} colorLabel={colorInfo?.label} />}
      </form>
    </Dialog>
  )
}

function resultTitle({ summary }: BoxBatchResult): string {
  const created = plural(summary.created, 'caixa criada', 'caixas criadas')
  return summary.failed ? `${created} · ${plural(summary.failed, 'não entrou', 'não entraram')}` : created
}

function BatchPreview({ items, colorLabel }: { items: PreviewItem[]; colorLabel?: string }) {
  const fresh = items.filter((item) => item.status.kind === 'new')
  const problems = items.filter((item) => item.status.kind !== 'new')
  const shown = items.slice(0, MAX_CHIPS)

  return (
    <section aria-label="Pré-visualização" className="flex flex-col gap-2 rounded-xl bg-surface-muted p-3">
      <p className="text-base font-semibold text-ink" aria-live="polite">
        {fresh.length
          ? `Vai criar ${plural(fresh.length, 'caixa')}${colorLabel ? ` na cor ${colorLabel}` : ''}.`
          : 'Nenhuma caixa nova nesta lista.'}
        {problems.length > 0 && ` ${plural(problems.length, 'número não entra', 'números não entram')}.`}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((item, index) => (
          <li
            key={`${item.number}-${index}`}
            className={cn(
              'rounded-lg border px-2 py-1 font-mono text-sm font-semibold tabular-nums',
              item.status.kind === 'new' && 'border-line-strong bg-surface text-ink',
              item.status.kind === 'repeated' && 'border-warning/40 bg-warning-soft text-warning',
              item.status.kind === 'exists' && 'border-danger/40 bg-danger-soft text-danger line-through',
            )}
          >
            {item.number}
            <span className="sr-only">{statusLabel(item)}</span>
          </li>
        ))}
        {items.length > MAX_CHIPS && <li className="px-2 py-1 text-sm text-ink-muted">e mais {items.length - MAX_CHIPS}</li>}
      </ul>
      {problems.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-sm">
          {problems.slice(0, 10).map((item, index) => (
            <li key={`${item.number}-${index}`} className={item.status.kind === 'exists' ? 'text-danger' : 'text-warning'}>
              <strong className="font-mono">{item.number}</strong>: {statusLabel(item)}
            </li>
          ))}
          {problems.length > 10 && <li className="text-ink-muted">e mais {problems.length - 10}</li>}
        </ul>
      )}
    </section>
  )
}

function statusLabel(item: PreviewItem): string {
  if (item.status.kind === 'repeated') return 'repetido nesta lista'
  if (item.status.kind === 'exists') return `já existe (${item.status.box.colorLabel})`
  return 'nova'
}
