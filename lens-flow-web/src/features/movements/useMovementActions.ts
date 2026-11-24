import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { normalizeApiError, type BatchAction, type Movement, type UndoAction } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { plural } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'
import { checkoutMovement, newRequestId, releaseBox, runBatch, undoBatch, undoMovement } from './api'
import { afterMovementChange, optimisticMovement, replaceMovements } from './cache'

export interface BatchFailure {
  movement: Movement
  message: string
}

export interface ActionOutcome {
  succeeded: Movement[]
  failures: BatchFailure[]
}

const DONE_TEXT: Record<BatchAction, { one: string; many: (count: number) => string }> = {
  checkout: { one: 'Baixa dada', many: (count) => `Baixa de ${plural(count, 'serviço')}` },
  'release-box': { one: 'Caixa liberada', many: (count) => `${plural(count, 'caixa liberada', 'caixas liberadas')}` },
  'checkout-and-release': {
    one: 'Saiu e caixa liberada',
    many: (count) => `Baixa e liberação de ${plural(count, 'serviço')}`,
  },
}

function label(movement: Movement): string {
  return `caixa ${movement.box.number} · ${movement.clientName}`
}

/**
 * Baixa, liberação e desfazer, com UI otimista e rollback (T2, D6, D9).
 * O aviso traz "Desfazer" (um item) ou "Desfazer lote" (vários, R7).
 */
export function useMovementActions() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const toast = useToast()

  const undoOne = useCallback(
    async (movement: Movement, action: UndoAction) => {
      try {
        const updated = await undoMovement(movement.id, action)
        replaceMovements(queryClient, [updated])
        toast.show({
          message: `${action === 'checkout' ? 'Baixa desfeita' : 'Liberação desfeita'}: ${label(updated)}.`,
        })
        return updated
      } catch (error) {
        toast.show({ tone: 'error', message: `Não foi possível desfazer. ${normalizeApiError(error).message}` })
        return null
      } finally {
        afterMovementChange(queryClient)
      }
    },
    [queryClient, toast],
  )

  const undoWholeBatch = useCallback(
    async (batchId: string) => {
      try {
        const result = await undoBatch(batchId)
        const restored = result.results.flatMap((item) => (item.ok && item.movement ? [item.movement] : []))
        replaceMovements(queryClient, restored)
        const failed = result.results.filter((item) => !item.ok)
        toast.show({
          tone: failed.length ? 'error' : 'info',
          message: failed.length
            ? `Lote desfeito em parte: ${restored.length} de ${result.summary.requested} voltaram. ${failed[0]?.error?.message ?? ''}`
            : `Lote desfeito: ${plural(restored.length, 'serviço voltou', 'serviços voltaram')} para a Conferência.`,
        })
      } catch (error) {
        toast.show({ tone: 'error', message: `Não foi possível desfazer o lote. ${normalizeApiError(error).message}` })
      } finally {
        afterMovementChange(queryClient)
      }
    },
    [queryClient, toast],
  )

  const act = useCallback(
    async (movements: Movement[], action: BatchAction): Promise<ActionOutcome> => {
      if (movements.length === 0) return { succeeded: [], failures: [] }
      const previous = movements
      replaceMovements(
        queryClient,
        movements.map((movement) => optimisticMovement(movement, action, user)),
      )

      try {
        // Um serviço só, com uma ação só: rota própria e desfazer do item.
        if (movements.length === 1 && action !== 'checkout-and-release') {
          const [movement] = movements
          const updated = action === 'checkout' ? await checkoutMovement(movement.id) : await releaseBox(movement.id)
          replaceMovements(queryClient, [updated])
          const undoAction: UndoAction = action === 'checkout' ? 'checkout' : 'release-box'
          toast.show({
            tone: 'success',
            message: `${DONE_TEXT[action].one}: ${label(updated)}.`,
            action: { label: 'Desfazer', onClick: () => void undoOne(updated, undoAction) },
          })
          return { succeeded: [updated], failures: [] }
        }

        const result = await runBatch(
          movements.map((movement) => movement.id),
          action,
          newRequestId(),
        )
        const byId = new Map(previous.map((movement) => [movement.id, movement]))
        const succeeded: Movement[] = []
        const failures: BatchFailure[] = []
        for (const item of result.results) {
          const original = byId.get(item.id)
          if (item.ok && item.movement) succeeded.push(item.movement)
          else if (original) failures.push({ movement: original, message: item.error?.message ?? 'Não foi possível.' })
        }
        // Rollback só dos que falharam.
        replaceMovements(queryClient, [...succeeded, ...failures.map((failure) => failure.movement)])

        if (succeeded.length > 0) {
          const text =
            movements.length === 1
              ? `${DONE_TEXT[action].one}: ${label(succeeded[0])}.`
              : failures.length
                ? `${DONE_TEXT[action].many(succeeded.length)} de ${movements.length}. ${plural(failures.length, 'falhou', 'falharam')}.`
                : `${DONE_TEXT[action].many(succeeded.length)}.`
          toast.show({
            tone: 'success',
            message: text,
            action: {
              label: movements.length === 1 ? 'Desfazer' : 'Desfazer lote',
              onClick: () => void undoWholeBatch(result.batchId),
            },
          })
        } else if (movements.length === 1) {
          toast.show({ tone: 'error', message: `${label(movements[0])}: ${failures[0]?.message ?? 'não foi possível.'}` })
        }
        return { succeeded, failures }
      } catch (error) {
        replaceMovements(queryClient, previous)
        const message = normalizeApiError(error).message
        toast.show({ tone: 'error', message: `Nada foi alterado. ${message}` })
        return { succeeded: [], failures: previous.map((movement) => ({ movement, message })) }
      } finally {
        afterMovementChange(queryClient)
      }
    },
    [queryClient, toast, undoOne, undoWholeBatch, user],
  )

  return { act, undoOne, undoWholeBatch }
}
