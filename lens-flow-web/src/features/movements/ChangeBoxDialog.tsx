import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { normalizeApiError, type Movement } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { BoxChip } from '@/features/boxes/BoxChip'
import { BoxLookupResult } from '@/features/boxes/BoxLookupResult'
import { validateBoxNumber } from '@/features/boxes/api'
import { boxAvailability, useBoxLookup } from '@/features/boxes/boxAvailability'
import { changeBox } from './api'
import { afterMovementChange, replaceMovements } from './cache'

/** Trocar a caixa de um serviço aberto (RN-12, D19), com o mesmo seletor do lançamento (R14). */
export function ChangeBoxDialog({ movement, onClose }: { movement: Movement | null; onClose: () => void }) {
  return (
    <Dialog open={movement !== null} title="Trocar caixa" onClose={onClose}>
      {movement && <ChangeBoxForm key={movement.id} movement={movement} onDone={onClose} />}
    </Dialog>
  )
}

function ChangeBoxForm({ movement, onDone }: { movement: Movement; onDone: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [number, setNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const lookup = useBoxLookup(number)
  const valid = validateBoxNumber(number) === null
  const box = valid ? lookup.data : undefined
  const availability = box ? boxAvailability(box) : null
  const sameBox = box?.id === movement.box.id

  const mutation = useMutation({
    mutationFn: (boxId: string) => changeBox(movement.id, boxId),
    onSuccess: (updated) => {
      replaceMovements(queryClient, [updated])
      afterMovementChange(queryClient)
      toast.show({
        tone: 'success',
        message: `Caixa trocada: ${updated.clientName} saiu da caixa ${movement.box.number} e foi para a ${updated.box.number}.`,
      })
      onDone()
    },
    onError: (err) => {
      const apiError = normalizeApiError(err)
      setError(apiError.fields.boxId ?? apiError.message)
      void lookup.refetch()
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const formatError = validateBoxNumber(number)
    if (formatError) return setError(formatError)
    if (!box) return setError(box === null ? `Não existe caixa ${number}.` : 'Aguarde a busca da caixa.')
    if (sameBox) return setError('Escolha uma caixa diferente da atual.')
    if (availability && availability.kind !== 'free') return setError(`${availability.reason} Escolha outra caixa.`)
    setError(null)
    mutation.mutate(box.id)
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
        <span className="wrap-anywhere">{movement.clientName} está na</span>
        <BoxChip number={movement.box.number} color={movement.box.color} size="sm" />
      </div>
      <div>
        <TextField
          label="Caixa nova"
          value={number}
          onChange={(event) => {
            setNumber(event.target.value.replace(/\D/g, ''))
            setError(null)
          }}
          inputMode="numeric"
          pattern="[0-9]*"
          enterKeyHint="done"
          autoComplete="off"
          maxLength={6}
          error={error ?? undefined}
          data-autofocus
        />
        {!sameBox && (
          <BoxLookupResult
            number={valid ? number : ''}
            box={box}
            isLoading={lookup.isFetching && lookup.data === undefined}
            error={lookup.error}
          />
        )}
        {sameBox && (
          <Alert tone="warning" className="mt-2">
            Essa já é a caixa do serviço. Digite outra.
          </Alert>
        )}
      </div>
      <Button
        type="submit"
        size="lg"
        fullWidth
        loading={mutation.isPending}
        loadingText="Trocando…"
        disabled={!box || sameBox || availability?.kind !== 'free'}
        icon={<ArrowLeftRight aria-hidden="true" className="size-5" />}
      >
        {box && availability?.kind === 'free' && !sameBox ? `Trocar para a caixa ${box.number}` : 'Trocar caixa'}
      </Button>
    </form>
  )
}
