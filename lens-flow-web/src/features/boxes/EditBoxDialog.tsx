import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCcw } from 'lucide-react'
import { normalizeApiError, type Box, type BoxColor } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { boxKeys, updateBox, validateBoxNumber } from './api'
import { occupiedReason } from './boxAvailability'
import { ColorPicker } from './ColorPicker'

type BoxChanges = Partial<{ number: string; color: BoxColor; active: boolean }>

/** Erro da API em texto claro, com a ocupação quando a caixa está em uso (contrato 3.11). */
function describeError(error: unknown): { number?: string; color?: string; form?: string } {
  const apiError = normalizeApiError(error)
  if (apiError.code === 'BOX_OCCUPIED') {
    const box = apiError.details?.box as Box | undefined
    const reason = box ? occupiedReason(box) : apiError.message
    return { form: `${reason} Uma caixa ocupada não pode ser editada nem desativada: libere a caixa antes.` }
  }
  if (apiError.fields.number || apiError.fields.color) return { number: apiError.fields.number, color: apiError.fields.color }
  return { form: apiError.message }
}

/** Editar e desativar uma caixa (admin, seção 6 item 9). */
export function EditBoxDialog({ box, onClose }: { box: Box | null; onClose: () => void }) {
  return box ? <EditBoxForm key={box.id} box={box} onClose={onClose} /> : null
}

function EditBoxForm({ box, onClose }: { box: Box; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [number, setNumber] = useState(box.number)
  const [color, setColor] = useState<BoxColor>(box.color)
  const [errors, setErrors] = useState<{ number?: string; color?: string; form?: string }>({})

  const mutation = useMutation({
    mutationFn: (changes: BoxChanges) => updateBox(box.id, changes),
    onSuccess: (updated, changes) => {
      void queryClient.invalidateQueries({ queryKey: boxKeys.all })
      if (changes.active === false) {
        toast.show({
          tone: 'success',
          message: `Caixa ${updated.number} desativada. Ela não recebe mais serviço.`,
          action: { label: 'Desfazer', onClick: () => void reactivate(updated) },
        })
      } else if (changes.active === true) {
        toast.show({ tone: 'success', message: `Caixa ${updated.number} reativada.` })
      } else {
        toast.show({ tone: 'success', message: `Caixa ${updated.number} atualizada.` })
      }
      onClose()
    },
    onError: (error) => setErrors(describeError(error)),
  })

  async function reactivate(target: Box) {
    try {
      await updateBox(target.id, { active: true })
      void queryClient.invalidateQueries({ queryKey: boxKeys.all })
      toast.show({ message: `Caixa ${target.number} reativada.` })
    } catch (error) {
      toast.show({ tone: 'error', message: `Não foi possível reativar. ${normalizeApiError(error).message}` })
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const numberError = validateBoxNumber(number)
    if (numberError) {
      setErrors({ number: numberError })
      return
    }
    const changes: BoxChanges = {}
    if (number !== box.number) changes.number = number
    if (color !== box.color) changes.color = color
    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }
    setErrors({})
    mutation.mutate(changes)
  }

  const occupied = box.state === 'occupied'

  return (
    <Dialog
      open
      title={`Caixa ${box.number}`}
      onClose={() => !mutation.isPending && onClose()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-box-form" loading={mutation.isPending && mutation.variables?.active === undefined} loadingText="Salvando…" disabled={mutation.isPending}>
            Salvar
          </Button>
        </>
      }
    >
      <form id="edit-box-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label={`Editar caixa ${box.number}`}>
        {occupied && (
          <Alert tone="warning" title="Caixa ocupada">
            {occupiedReason(box)} Libere a caixa antes de editar ou desativar.
          </Alert>
        )}
        {errors.form && <Alert tone="error">{errors.form}</Alert>}

        <TextField
          label="Número"
          value={number}
          onChange={(event) => {
            setNumber(event.target.value.replace(/\D/g, ''))
            setErrors({})
          }}
          error={errors.number}
          hint="Como na etiqueta: 007 e 7 são caixas diferentes."
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          autoComplete="off"
          className="[&_input]:font-mono [&_input]:text-xl"
        />
        <ColorPicker
          label="Cor"
          value={color}
          onChange={(next) => {
            setColor(next)
            setErrors({})
          }}
          error={errors.color}
        />

        <div className="flex flex-col gap-2 border-t border-line pt-4">
          {box.active ? (
            <>
              <Button
                variant="secondary"
                className="self-start text-danger"
                icon={<Ban aria-hidden="true" className="size-4" />}
                loading={mutation.isPending && mutation.variables?.active === false}
                disabled={mutation.isPending}
                onClick={() => {
                  setErrors({})
                  mutation.mutate({ active: false })
                }}
              >
                Desativar caixa
              </Button>
              <p className="text-sm text-ink-muted">Para caixa perdida ou quebrada. Ela some do lançamento e pode ser reativada depois.</p>
            </>
          ) : (
            <Button
              variant="secondary"
              className="self-start"
              icon={<RotateCcw aria-hidden="true" className="size-4" />}
              loading={mutation.isPending && mutation.variables?.active === true}
              disabled={mutation.isPending}
              onClick={() => {
                setErrors({})
                mutation.mutate({ active: true })
              }}
            >
              Reativar caixa
            </Button>
          )}
          <Link to={`/caixas/${box.id}`} className="focus-ring self-start py-2 text-sm font-semibold text-primary underline-offset-4 hover:underline">
            Abrir a página da caixa
          </Link>
        </div>
      </form>
    </Dialog>
  )
}
