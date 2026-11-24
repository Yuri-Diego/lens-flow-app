import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, type Location } from 'react-router-dom'
import { ShieldAlert, WifiOff } from 'lucide-react'
import type { Role } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from './AuthProvider'

/** Estado que a rota de login recebe: de onde a pessoa veio e por quê. */
export interface LoginLocationState {
  from?: Pick<Location, 'pathname' | 'search' | 'hash'>
  switchUser?: boolean
}

/** "Carregando…" só depois de 300 ms: no recarregar rápido, a tela não pisca. */
function SessionLoading() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 300)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div role="status" className="flex min-h-dvh items-center justify-center gap-3 text-ink-muted">
      {visible && (
        <>
          <Spinner />
          <span>Carregando…</span>
        </>
      )}
    </div>
  )
}

/** Rota protegida: sem sessão, vai ao login guardando a rota pedida. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, error, retry, endReason } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <SessionLoading />

  if (status === 'error') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <EmptyState
          icon={WifiOff}
          title="Não foi possível abrir o Lens Flow"
          description={error?.message}
          action={<Button onClick={retry}>Tentar de novo</Button>}
        />
      </div>
    )
  }

  if (status === 'anonymous') {
    const from = { pathname: location.pathname, search: location.search, hash: location.hash }
    // "Sair" não guarda a rota; "Trocar usuário" guarda e avisa o login.
    const state: LoginLocationState =
      endReason === 'signout' ? {} : endReason === 'switch' ? { from, switchUser: true } : { from }
    return <Navigate to="/login" replace state={state} />
  }

  return children ?? <Outlet />
}

/** Guarda de perfil: quem não tem o perfil vê o aviso, sem ver a tela. */
export function RequireRole({ role, children }: { role: Role; children?: ReactNode }) {
  const { user } = useAuth()

  if (user?.role !== role) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Você não tem acesso a esta tela"
        description="Ela é só para administradores. Se precisar, fale com o administrador do laboratório."
      />
    )
  }

  return children ?? <Outlet />
}
