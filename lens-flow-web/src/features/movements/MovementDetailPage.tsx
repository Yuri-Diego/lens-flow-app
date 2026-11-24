import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight, PackageCheck, Pencil, Trash2 } from 'lucide-react'
import { normalizeApiError, type FieldErrors, type HistoryEvent, type Movement } from '@/lib/api'
import { formatDayMonth, formatDayTime } from '@/lib/format'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { BoxChip } from '@/features/boxes/BoxChip'
import { ClientNameField } from '@/features/clients/ClientNameField'
import { deleteMovement, fetchMovement, movementKeys, updateMovement } from './api'
import { afterMovementChange, replaceMovements } from './cache'
import { ChangeBoxDialog } from './ChangeBoxDialog'
import { MovementStatus } from './MovementBadges'
import { movementStage } from './movementLabels'
import { UndoButton } from './UndoButton'
import { useMovementActions } from './useMovementActions'

interface BoxRef {
  number?: string
}

function boxNumberOf(value: unknown): string | null {
  const box = (value as { box?: BoxRef } | null)?.box
  return typeof box?.number === 'string' ? box.number : null
}

const FIELD_LABELS: Record<string, string> = { clientName: 'cliente', orderService: 'OS', note: 'observação' }

/** "Lançado por Ana", "Baixa por João"… (seção 6, item 7). */
function describeEvent(event: HistoryEvent): string {
  const who = event.user?.name ?? 'sistema'
  switch (event.action) {
    case 'movement.create': {
      const number = boxNumberOf(event.after)
      return `Lançado por ${who}${number ? ` na caixa ${number}` : ''}`
    }
    case 'movement.update': {
      const changed = Object.keys(event.after ?? {})
        .map((key) => FIELD_LABELS[key])
        .filter(Boolean)
      return `Editado por ${who}${changed.length ? ` (${changed.join(', ')})` : ''}`
    }
    case 'movement.change_box': {
      const from = boxNumberOf(event.before)
      const to = boxNumberOf(event.after)
      return `Caixa trocada por ${who}${from && to ? `: da ${from} para a ${to}` : ''}`
    }
    case 'movement.checkout':
      return `Baixa por ${who}`
    case 'movement.release_box':
      return `Caixa liberada por ${who}`
    case 'movement.undo_checkout':
      return `Baixa desfeita por ${who}`
    case 'movement.undo_release_box':
      return `Liberação desfeita por ${who}`
    case 'movement.delete':
      return `Excluído por ${who}`
    default:
      return `${event.action} por ${who}`
  }
}

/** Detalhe do serviço (seção 6, item 7): dados, linha do tempo e as ações do perfil. */
export function MovementDetailPage() {
  const { id = '' } = useParams()
  const query = useQuery({ queryKey: movementKeys.detail(id), queryFn: () => fetchMovement(id) })

  if (query.isPending) {
    return (
      <section>
        <PageHeader title="Serviço" />
        <ListSkeleton rows={2} />
      </section>
    )
  }
  if (query.isError) {
    const error = normalizeApiError(query.error)
    return (
      <section>
        <PageHeader title="Serviço" />
        {error.code === 'NOT_FOUND' ? (
          <EmptyState title="Serviço não encontrado" description="Ele pode ter sido excluído. Volte e procure de novo." />
        ) : (
          <ErrorState error={error} onRetry={() => void query.refetch()} />
        )}
      </section>
    )
  }

  return <MovementDetail movement={query.data.movement} history={query.data.history} />
}

function MovementDetail({ movement, history }: { movement: Movement; history: HistoryEvent[] }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const { act, undoOne } = useMovementActions()
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [changing, setChanging] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const stage = movementStage(movement)

  async function run(task: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    try {
      await task()
    } finally {
      setBusy(false)
      void queryClient.invalidateQueries({ queryKey: movementKeys.detail(movement.id) })
    }
  }

  const remove = useMutation({
    mutationFn: () => deleteMovement(movement.id),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: movementKeys.detail(movement.id) })
      afterMovementChange(queryClient)
      toast.show({ message: `Lançamento excluído. A caixa ${movement.box.number} ficou livre.` })
      navigate(-1)
    },
    onError: (error) => toast.show({ tone: 'error', message: `Não foi possível excluir. ${normalizeApiError(error).message}` }),
  })

  return (
    <section>
      <PageHeader title={movement.clientName} description={`Folha de ${formatDayMonth(movement.sheetDate)}`} />

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        <Link to={`/caixas/${movement.box.id}`} className="focus-ring self-start rounded-xl">
          <BoxChip number={movement.box.number} color={movement.box.color} size="lg" />
        </Link>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
          <dt className="text-ink-muted">OS</dt>
          <dd className="font-semibold">{movement.orderService ?? '—'}</dd>
          <dt className="text-ink-muted">Observação</dt>
          <dd>{movement.note ?? '—'}</dd>
          <dt className="text-ink-muted">Situação</dt>
          <dd>
            <MovementStatus movement={movement} />
          </dd>
        </dl>

        <div className="flex flex-wrap gap-2">
          {stage === 'open' && (
            <>
              <Button size="lg" loading={busy} onClick={() => void run(() => act([movement], 'checkout-and-release'))}>
                Saiu e liberar
              </Button>
              <Button variant="secondary" size="lg" disabled={busy} onClick={() => void run(() => act([movement], 'checkout'))}>
                Só dar baixa
              </Button>
            </>
          )}
          {movement.canChangeBox && (
            <Button
              variant="secondary"
              size="lg"
              disabled={busy}
              onClick={() => setChanging(true)}
              icon={<ArrowLeftRight aria-hidden="true" className="size-5" />}
            >
              Trocar caixa
            </Button>
          )}
          {stage === 'out' && (
            <Button
              size="lg"
              loading={busy}
              onClick={() => void run(() => act([movement], 'release-box'))}
              icon={<PackageCheck aria-hidden="true" className="size-5" />}
            >
              Liberar caixa
            </Button>
          )}
          <UndoButton
            movement={movement}
            size="lg"
            loading={busy}
            onUndo={() => movement.undo && void run(() => undoOne(movement, movement.undo!.action))}
          />
        </div>

        {movement.canEdit && !editing && (
          <div className="flex flex-wrap gap-2 border-t border-line pt-3">
            <Button variant="secondary" onClick={() => setEditing(true)} icon={<Pencil aria-hidden="true" className="size-4" />}>
              Editar
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => setConfirmDelete(true)} icon={<Trash2 aria-hidden="true" className="size-4" />}>
              Excluir
            </Button>
          </div>
        )}
        {editing && <EditForm movement={movement} onDone={() => setEditing(false)} />}
      </div>

      <h2 className="mb-2 text-lg font-bold text-ink">Linha do tempo</h2>
      <ol className="relative ml-2 flex flex-col gap-3 border-l-2 border-line pl-4" aria-label="Linha do tempo">
        {history.map((event) => (
          <li key={event.id} className="relative">
            <span aria-hidden="true" className="absolute -left-[23px] top-1.5 size-3 rounded-full border-2 border-surface bg-primary" />
            <p className="font-medium text-ink">{describeEvent(event)}</p>
            <p className="text-sm text-ink-muted">{formatDayTime(event.at)}</p>
          </li>
        ))}
      </ol>

      <ChangeBoxDialog movement={changing ? movement : null} onClose={() => setChanging(false)} />
      <Dialog
        open={confirmDelete}
        title="Excluir lançamento?"
        onClose={() => setConfirmDelete(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Excluir
            </Button>
          </>
        }
      >
        <p>
          O serviço de <strong>{movement.clientName}</strong> some das listas e a caixa {movement.box.number} fica livre. O
          registro continua no histórico.
        </p>
      </Dialog>
    </section>
  )
}

function EditForm({ movement, onDone }: { movement: Movement; onDone: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [clientName, setClientName] = useState(movement.clientName)
  const [orderService, setOrderService] = useState(movement.orderService ?? '')
  const [note, setNote] = useState(movement.note ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const orderServiceRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: () =>
      updateMovement(movement.id, {
        clientName: clientName.trim(),
        orderService: orderService.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: ({ movement: updated, warnings }) => {
      replaceMovements(queryClient, [updated])
      afterMovementChange(queryClient)
      void queryClient.invalidateQueries({ queryKey: movementKeys.detail(movement.id) })
      toast.show({ tone: 'success', message: ['Serviço atualizado.', ...warnings.map((w) => w.message)].join(' ') })
      onDone()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      setErrors(Object.keys(apiError.fields).length ? apiError.fields : { form: apiError.message })
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const next: FieldErrors = {}
    if (!clientName.trim()) next.clientName = 'Informe o cliente.'
    else if (clientName.trim().length > 120) next.clientName = 'O cliente pode ter no máximo 120 caracteres.'
    if (orderService.trim().length > 40) next.orderService = 'A OS pode ter no máximo 40 caracteres.'
    if (note.trim().length > 500) next.note = 'A observação pode ter no máximo 500 caracteres.'
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate()
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-3 border-t border-line pt-3" aria-label="Editar serviço">
      {errors.form && <Alert tone="error">{errors.form}</Alert>}
      <ClientNameField
        label="Cliente"
        value={clientName}
        onValueChange={setClientName}
        onPick={() => orderServiceRef.current?.focus()}
        error={errors.clientName}
        autoCapitalize="words"
        autoComplete="off"
        spellCheck={false}
        maxLength={120}
      />
      <TextField ref={orderServiceRef} label="OS (opcional)" value={orderService} onChange={(e) => setOrderService(e.target.value)} error={errors.orderService} maxLength={40} />
      <TextField label="Observação (opcional)" value={note} onChange={(e) => setNote(e.target.value)} error={errors.note} maxLength={500} />
      <div className="flex gap-2">
        <Button type="submit" loading={mutation.isPending} loadingText="Salvando…">
          Salvar
        </Button>
        <Button variant="secondary" onClick={onDone} disabled={mutation.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
