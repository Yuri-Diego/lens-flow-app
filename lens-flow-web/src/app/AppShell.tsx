import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { LogOut, UserRoundCog } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { useSessionActions } from '@/lib/auth/useSessionActions'
import { OfflineBanner } from '@/lib/network/OfflineBanner'
import { cn } from '@/lib/cn'
import { Spinner } from '@/components/ui/Spinner'
import { BOTTOM_NAV, NAV, SIDEBAR_GROUPS, isInMore, visibleFor } from './navigation'

const ROLE_LABEL = { admin: 'Administrador', operator: 'Operador' } as const

/** Layout logado: cabeçalho, barra lateral (computador) e barra inferior (celular). */
export function AppShell() {
  return (
    <div className="min-h-dvh md:pl-64">
      <a
        href="#conteudo"
        className="focus-ring sr-only z-50 rounded-xl bg-surface px-4 py-3 font-semibold focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="sticky top-0 z-30">
        <Header />
        <OfflineBanner />
      </div>
      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-5xl px-safe pb-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+1.5rem)] pt-4 outline-none md:px-8 md:pb-10 md:pt-6"
      >
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}

function Header() {
  const { user } = useAuth()
  const { pending, switchUser, signOut } = useSessionActions()
  if (!user) return null

  return (
    <header className="border-b border-line bg-surface pt-safe">
      <div className="flex min-h-14 items-center gap-2 px-safe py-1.5 md:px-8">
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate font-semibold text-ink" data-testid="current-user">
            {user.name}
          </p>
          <p className="truncate text-xs text-ink-muted">{ROLE_LABEL[user.role]}</p>
        </div>
        <button
          type="button"
          onClick={switchUser}
          disabled={pending !== null}
          className="focus-ring inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-xl border border-line-strong px-3 text-sm font-semibold text-ink hover:bg-surface-muted disabled:opacity-60"
        >
          {pending === 'switch' ? <Spinner className="size-4" /> : <UserRoundCog aria-hidden="true" className="size-4" />}
          Trocar usuário
        </button>
        <button
          type="button"
          onClick={signOut}
          disabled={pending !== null}
          className="focus-ring inline-flex min-h-touch shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-ink-muted hover:bg-surface-muted hover:text-ink disabled:opacity-60"
        >
          {pending === 'signout' ? <Spinner className="size-4" /> : <LogOut aria-hidden="true" className="size-4" />}
          Sair
        </button>
      </div>
    </header>
  )
}

function Sidebar() {
  const { user } = useAuth()

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-line bg-surface pt-safe md:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <span aria-hidden="true" className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-bold text-ink-inverse">
          LF
        </span>
        <div className="leading-tight">
          <p className="text-lg font-bold text-ink">Lens Flow</p>
          {user && <p className="truncate text-xs text-ink-muted">{user.business.name}</p>}
        </div>
      </div>
      <nav aria-label="Navegação principal" className="flex flex-1 flex-col gap-4 overflow-y-auto px-3 pb-6">
        {SIDEBAR_GROUPS.map((group, index) => {
          const items = visibleFor(group.items, user?.role)
          if (items.length === 0) return null
          return (
            <div key={group.label ?? index} className="flex flex-col gap-1">
              {group.label && (
                <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{group.label}</p>
              )}
              {items.map(({ to, label, Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      'focus-ring flex min-h-touch items-center gap-3 rounded-xl px-3 text-base font-medium',
                      isActive ? 'bg-primary-soft text-primary' : 'text-ink-muted hover:bg-surface-muted hover:text-ink',
                    )
                  }
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0" />
                  {label}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

function BottomNav() {
  const { pathname } = useLocation()

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface pb-safe md:hidden"
    >
      <ul className="mx-auto grid h-bottom-nav max-w-lg grid-cols-4">
        {BOTTOM_NAV.map(({ to, label, Icon }) => {
          const forceActive = to === NAV.more.to && isInMore(pathname)
          return (
            <li key={to}>
              <NavLink
                to={to}
                aria-current={forceActive ? 'page' : undefined}
                className={({ isActive }) =>
                  cn(
                    'focus-ring flex h-full flex-col items-center justify-center gap-0.5 text-xs font-semibold',
                    isActive || forceActive ? 'text-primary' : 'text-ink-muted',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-14 items-center justify-center rounded-full',
                        (isActive || forceActive) && 'bg-primary-soft',
                      )}
                    >
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
