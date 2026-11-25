import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useToast } from '@/components/ui/Toast'
import { NEW_MOVEMENT_PATH, useLaunchOutbox, type NewMovementLocationState } from './launchOutbox'

const toastId = (requestId: string) => `launch-failed:${requestId}`

/**
 * Avisa, em qualquer tela, o lançamento que não entrou, inclusive o que falhou
 * com a sessão encerrada ou antes de recarregar. O aviso fecha quando o
 * lançamento é corrigido.
 */
export function LaunchFailureNotices() {
  const { toFix } = useLaunchOutbox()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pathnameRef = useRef(pathname)
  const notified = useRef<Set<string> | null>(null)

  useEffect(() => {
    pathnameRef.current = pathname
  }, [pathname])

  useEffect(() => {
    const failed = toFix.filter((entry) => entry.status !== 'parked')
    const failedIds = new Set(failed.map((entry) => entry.requestId))
    // Quem abre já em "Novo serviço" vê a lista para corrigir: não precisa do aviso.
    notified.current ??= new Set(pathnameRef.current === NEW_MOVEMENT_PATH ? failedIds : [])
    const known = notified.current

    for (const { requestId, form, message } of failed) {
      if (known.has(requestId)) continue
      known.add(requestId)
      const state: NewMovementLocationState = { fix: requestId }
      toast.show({
        id: toastId(requestId),
        tone: 'error',
        duration: null,
        message: `Caixa ${form.boxNumber} (${form.clientName.trim()}) não foi lançada. ${message}`,
        action: {
          label: 'Corrigir',
          onClick: () => void navigate(NEW_MOVEMENT_PATH, { state, replace: pathnameRef.current === NEW_MOVEMENT_PATH }),
        },
      })
    }
    for (const requestId of known) {
      if (failedIds.has(requestId)) continue
      known.delete(requestId)
      toast.dismiss(toastId(requestId))
    }
  }, [toFix, toast, navigate])

  return null
}
