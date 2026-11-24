import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Lock, ShieldCheck, UserPlus, UserRound } from 'lucide-react'
import type { User } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { formatDayTime, formatTime } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { fetchUsers, ROLE_LABELS, userKeys } from './api'
import { NewUserDialog } from './NewUserDialog'
import { UserDialog } from './UserDialog'

/** Usuários (admin, seção 6 item 10): criar, redefinir senha, desativar e definir o perfil. */
export function UsersPage() {
  const { user: me } = useAuth()
  const [creating, setCreating] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const query = useQuery({ queryKey: userKeys.list(), queryFn: fetchUsers })
  const users = query.data ?? []
  const activeAdmins = users.filter((item) => item.active && item.role === 'admin').length
  const selected = users.find((item) => item.id === selectedId) ?? null
  const activeCount = users.filter((item) => item.active).length

  return (
    <section>
      <PageHeader
        title="Usuários"
        description={query.data ? `${activeCount} ${activeCount === 1 ? 'ativo' : 'ativos'} · cada pessoa com o próprio login` : 'Contas de quem usa o Lens Flow no laboratório.'}
        actions={
          <Button onClick={() => setCreating(true)} icon={<UserPlus aria-hidden="true" className="size-5" />}>
            Novo usuário
          </Button>
        }
      />

      {query.isPending ? (
        <ListSkeleton rows={4} label="Carregando usuários…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : users.length === 0 ? (
        <EmptyState icon={UserRound} title="Nenhum usuário" />
      ) : (
        <ul aria-label="Usuários" className="flex flex-col divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {users.map((item) => (
            <li key={item.id}>
              <UserRow user={item} isMe={item.id === me?.id} onOpen={() => setSelectedId(item.id)} />
            </li>
          ))}
        </ul>
      )}

      <NewUserDialog open={creating} onClose={() => setCreating(false)} />
      {selected && me && (
        <UserDialog
          key={selected.id}
          user={selected}
          isMe={selected.id === me.id}
          activeAdmins={activeAdmins}
          onClose={() => setSelectedId(null)}
        />
      )}
    </section>
  )
}

function UserRow({ user, isMe, onOpen }: { user: User; isMe: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring flex min-h-touch-lg w-full items-center gap-3 p-3 text-left hover:bg-surface-muted"
    >
      <div className="min-w-0 flex-1">
        <p className={user.active ? 'truncate font-semibold text-ink' : 'truncate font-semibold text-ink-muted line-through'}>
          {user.name}
          {isMe && <span className="ml-1 font-normal text-ink-muted no-underline">(você)</span>}
        </p>
        <p className="truncate text-sm text-ink-muted">
          {user.username} · {user.lastLoginAt ? `último acesso ${formatDayTime(user.lastLoginAt)}` : 'ainda não entrou'}
        </p>
        <p className="mt-1 flex flex-wrap gap-1.5 text-xs font-semibold">
          <span
            className={
              user.role === 'admin'
                ? 'inline-flex items-center gap-1 rounded-md bg-primary-soft px-1.5 py-0.5 text-primary'
                : 'inline-flex items-center gap-1 rounded-md bg-surface-muted px-1.5 py-0.5 text-ink'
            }
          >
            {user.role === 'admin' ? <ShieldCheck aria-hidden="true" className="size-3.5" /> : <UserRound aria-hidden="true" className="size-3.5" />}
            {ROLE_LABELS[user.role]}
          </span>
          {!user.active && <span className="rounded-md bg-surface-muted px-1.5 py-0.5 text-ink-muted">Desativado</span>}
          {user.locked && (
            <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-warning">
              <Lock aria-hidden="true" className="size-3.5" />
              Bloqueado{user.lockedUntil ? ` até ${formatTime(user.lockedUntil)}` : ''}
            </span>
          )}
        </p>
      </div>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
    </button>
  )
}
