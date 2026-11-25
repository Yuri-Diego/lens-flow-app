import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { normalizeApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { useToast } from '@/components/ui/Toast'
import {
  NEW_MOVEMENT_PATH,
  usePendingLaunches,
  type NewMovementLocationState,
  type PendingLaunches,
} from '@/features/movements/launchOutbox'
import { SessionActionsContext, type SessionActions } from './useSessionActions'

/** O que falta, sem dizer que não entrou o que ainda pode entrar (D27). */
function pendingSentences({ refused, unconfirmed, sending }: PendingLaunches): string[] {
  const sentences: string[] = []
  if (refused > 0) {
    sentences.push(`Há ${plural(refused, 'lançamento que não entrou', 'lançamentos que não entraram')}.`)
  }
  if (unconfirmed > 0) {
    sentences.push(
      `Há ${plural(unconfirmed, 'lançamento sem confirmação: pode ou não ter entrado', 'lançamentos sem confirmação: podem ou não ter entrado')}.`,
    )
  }
  if (sending > 0) {
    sentences.push(
      `Há ${plural(sending, 'lançamento ainda em envio: pode ou não entrar', 'lançamentos ainda em envio: podem ou não entrar')}.`,
    )
  }
  return sentences
}

/**
 * "Trocar usuário" e "Sair", um só para o layout todo. "Sair" pergunta antes se
 * há lançamento recusado ou em envio (D27). Quem leva ao login é a rota
 * protegida, quando a sessão sai do contexto.
 */
export function SessionActionsProvider({ children }: { children: ReactNode }) {
  const { logout } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const launches = usePendingLaunches()
  const [pending, setPending] = useState<'switch' | 'signout' | null>(null)
  const [asking, setAsking] = useState(false)

  const toFix = launches.refused + launches.unconfirmed
  const total = toFix + launches.sending

  // Tudo entrou com a pergunta aberta: não há mais o que confirmar.
  useEffect(() => {
    if (total === 0) setAsking(false)
  }, [total])

  async function run(reason: 'switch' | 'signout') {
    if (pending) return
    setPending(reason)
    try {
      await logout(reason)
    } catch (error) {
      setAsking(false)
      toast.show({ tone: 'error', message: `Não foi possível sair. ${normalizeApiError(error).message}` })
    } finally {
      setPending(null)
    }
  }

  function goBack() {
    if (pending) return
    setAsking(false)
    if (toFix === 0) return
    const state: NewMovementLocationState = { showToFix: true }
    navigate(NEW_MOVEMENT_PATH, { state, replace: pathname === NEW_MOVEMENT_PATH })
  }

  const actions: SessionActions = {
    pending,
    switchUser: () => void run('switch'),
    signOut: () => (total > 0 ? setAsking(true) : void run('signout')),
  }
  const sentences = useMemo(() => pendingSentences(launches), [launches])

  return (
    <SessionActionsContext.Provider value={actions}>
      {children}
      <Dialog
        open={asking && total > 0}
        title="Sair mesmo assim?"
        onClose={goBack}
        coverNotices
        footer={
          <>
            <Button variant="danger" onClick={() => void run('signout')} loading={pending === 'signout'} loadingText="Saindo…">
              Sair mesmo assim
            </Button>
            <Button data-autofocus onClick={goBack} disabled={pending !== null}>
              Voltar
            </Button>
          </>
        }
      >
        <div aria-live="polite" className="flex flex-col gap-2 text-base text-ink">
          {sentences.map((sentence) => (
            <p key={sentence} className="font-semibold">
              {sentence}
            </p>
          ))}
          <p className="text-ink-muted">
            {toFix > 0 && `Ao sair, ${toFix === 1 ? 'o que falta corrigir é apagado' : 'os que faltam corrigir são apagados'} deste aparelho. `}
            {launches.sending > 0 && 'Se você sair agora, o resultado do envio não aparece mais: confira depois na folha de hoje.'}
          </p>
        </div>
      </Dialog>
    </SessionActionsContext.Provider>
  )
}
