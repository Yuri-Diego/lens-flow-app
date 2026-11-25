import { Link } from 'react-router-dom'
import { ChevronRight, LogOut, UserRoundCog } from 'lucide-react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Spinner } from '@/components/ui/Spinner'
import { MORE_ITEMS, visibleFor } from './navigation'
import { useSessionActions } from './useSessionActions'

const rowClass =
  'focus-ring flex min-h-touch-lg w-full items-center gap-3 px-4 text-left text-base font-medium text-ink hover:bg-surface-muted disabled:opacity-60'

export function MorePage() {
  const { user } = useAuth()
  const { pending, switchUser, signOut } = useSessionActions()

  return (
    <section>
      <PageHeader title="Mais" />
      <nav aria-label="Mais opções" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          {visibleFor(MORE_ITEMS, user?.role).map(({ to, label, Icon }) => (
            <li key={to}>
              <Link to={to} className={rowClass}>
                <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                <span className="flex-1">{label}</span>
                <ChevronRight aria-hidden="true" className="size-5 text-ink-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface">
        <ul className="divide-y divide-line">
          <li>
            <button type="button" onClick={switchUser} disabled={pending !== null} className={rowClass}>
              {pending === 'switch' ? <Spinner /> : <UserRoundCog aria-hidden="true" className="size-5 text-ink-muted" />}
              Trocar usuário
            </button>
          </li>
          <li>
            <button type="button" onClick={signOut} disabled={pending !== null} className={rowClass}>
              {pending === 'signout' ? <Spinner /> : <LogOut aria-hidden="true" className="size-5 text-ink-muted" />}
              Sair
            </button>
          </li>
        </ul>
      </div>
    </section>
  )
}
