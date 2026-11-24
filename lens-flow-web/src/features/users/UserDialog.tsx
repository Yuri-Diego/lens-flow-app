import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Lock, RotateCcw, UserX } from 'lucide-react'
import { normalizeApiError, type FieldErrors, type Role, type User } from '@/lib/api'
import { ME_QUERY_KEY } from '@/lib/auth/AuthProvider'
import { formatTime } from '@/lib/format'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { resetUserPassword, updateUser, userKeys, validatePassword, validatePersonName } from './api'
import { RolePicker, TemporaryPasswordField } from './fields'

const SELF_DEACTIVATE = 'Você não pode desativar o seu próprio usuário.'
const LAST_ADMIN = 'É o único administrador ativo. Promova outra pessoa a administrador antes.'

function errorsFrom(error: unknown): FieldErrors {
  const apiError = normalizeApiError(error)
  return Object.keys(apiError.fields).length ? apiError.fields : { form: apiError.message }
}

/**
 * Um usuário (admin): nome e perfil, redefinir a senha e desativar. Os
 * bloqueios da RN-13 aparecem antes do toque (desativar a si mesmo, o último
 * admin), e a mensagem da API aparece se o servidor recusar mesmo assim.
 */
export function UserDialog({
  user,
  isMe,
  activeAdmins,
  onClose,
}: {
  user: User
  isMe: boolean
  activeAdmins: number
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<Role>(user.role)
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false)
  const [dataErrors, setDataErrors] = useState<FieldErrors>({})
  const [passwordErrors, setPasswordErrors] = useState<FieldErrors>({})
  const [statusError, setStatusError] = useState<string | null>(null)

  const isLastAdmin = user.active && user.role === 'admin' && activeAdmins <= 1
  const refresh = () => queryClient.invalidateQueries({ queryKey: userKeys.all })

  const save = useMutation({
    mutationFn: (changes: Partial<Pick<User, 'name' | 'role'>>) => updateUser(user.id, changes),
    onSuccess: (updated) => {
      void refresh()
      // Nome ou perfil da própria conta: o cabeçalho e a guarda de perfil seguem a mudança.
      if (isMe) void queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY })
      toast.show({ tone: 'success', message: `${updated.name}: dados atualizados.` })
      onClose()
    },
    onError: (error) => setDataErrors(errorsFrom(error)),
  })

  const reset = useMutation({
    mutationFn: (value: string) => resetUserPassword(user.id, value),
    onSuccess: () => {
      void refresh()
      toast.show({
        tone: 'success',
        duration: 10_000,
        message: isMe
          ? 'Sua senha foi redefinida. Os outros aparelhos saíram da sua conta.'
          : `Senha de ${user.name} redefinida. Passe a senha nova para a pessoa; os aparelhos dela saíram da conta.`,
      })
      onClose()
    },
    onError: (error) => setPasswordErrors(errorsFrom(error)),
  })

  const setActive = useMutation({
    mutationFn: (active: boolean) => updateUser(user.id, { active }),
    onSuccess: (updated) => {
      void refresh()
      toast.show({
        tone: 'success',
        message: updated.active
          ? `${updated.name} foi reativado e já pode entrar de novo.`
          : `${updated.name} foi desativado e saiu de todos os aparelhos.`,
      })
      onClose()
    },
    onError: (error) => {
      setConfirmingDeactivate(false)
      setStatusError(normalizeApiError(error).message)
    },
  })

  const pending = save.isPending || reset.isPending || setActive.isPending

  function onSave(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const nameError = validatePersonName(name)
    if (nameError) {
      setDataErrors({ name: nameError })
      return
    }
    const changes: Partial<Pick<User, 'name' | 'role'>> = {}
    if (name.trim() !== user.name) changes.name = name.trim()
    if (role !== user.role) changes.role = role
    if (Object.keys(changes).length === 0) {
      onClose()
      return
    }
    setDataErrors({})
    save.mutate(changes)
  }

  function onReset(event: FormEvent) {
    event.preventDefault()
    if (pending) return
    const error = validatePassword(password)
    if (error) {
      setPasswordErrors({ password: error })
      return
    }
    setPasswordErrors({})
    reset.mutate(password)
  }

  const deactivateBlocked = isMe ? SELF_DEACTIVATE : isLastAdmin ? LAST_ADMIN : null

  return (
    <Dialog open title={user.name} onClose={() => !pending && onClose()}>
      <div className="flex flex-col gap-5">
        <p className="text-sm text-ink-muted">
          Usuário <strong className="font-mono text-ink">{user.username}</strong>
          {isMe && ' · você'}
          {!user.active && ' · desativado'}
        </p>
        {user.locked && (
          <Alert tone="warning" title={`Bloqueado${user.lockedUntil ? ` até ${formatTime(user.lockedUntil)}` : ''}`}>
            Errou a senha 5 vezes. Redefinir a senha desbloqueia na hora.
          </Alert>
        )}

        <form noValidate onSubmit={onSave} aria-label="Dados do usuário" className="flex flex-col gap-4">
          {dataErrors.form && <Alert tone="error">{dataErrors.form}</Alert>}
          <TextField
            label="Nome"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              setDataErrors({})
            }}
            error={dataErrors.name}
            autoCapitalize="words"
            autoComplete="off"
            maxLength={80}
          />
          <RolePicker
            value={role}
            onChange={(next) => {
              setRole(next)
              setDataErrors({})
            }}
            disabledReason={isLastAdmin ? LAST_ADMIN : undefined}
            error={dataErrors.role}
          />
          {isMe && role === 'operator' && user.role === 'admin' && (
            <Alert tone="warning">Você vai deixar de ser administrador e perde o acesso a esta tela.</Alert>
          )}
          <Button type="submit" className="self-start" loading={save.isPending} loadingText="Salvando…" disabled={pending}>
            Salvar
          </Button>
        </form>

        <section aria-label="Senha" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="text-base font-bold text-ink">Senha</h3>
          {resetting ? (
            <form noValidate onSubmit={onReset} aria-label="Redefinir senha" className="flex flex-col gap-3">
              {passwordErrors.form && <Alert tone="error">{passwordErrors.form}</Alert>}
              <TemporaryPasswordField
                label="Nova senha temporária"
                value={password}
                onChange={(value) => {
                  setPassword(value)
                  setPasswordErrors({})
                }}
                error={passwordErrors.password}
              />
              <p className="text-sm text-ink-muted">
                {isMe ? 'Os seus outros aparelhos saem da conta; este continua.' : `${user.name} sai de todos os aparelhos e entra com a senha nova.`}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={reset.isPending} loadingText="Redefinindo…" disabled={pending}>
                  Redefinir senha
                </Button>
                <Button variant="secondary" onClick={() => setResetting(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="secondary"
              className="self-start"
              icon={user.locked ? <Lock aria-hidden="true" className="size-4" /> : <KeyRound aria-hidden="true" className="size-4" />}
              onClick={() => setResetting(true)}
              disabled={pending}
            >
              {user.locked ? 'Redefinir senha e desbloquear' : 'Redefinir senha'}
            </Button>
          )}
        </section>

        <section aria-label="Acesso" className="flex flex-col gap-3 border-t border-line pt-4">
          <h3 className="text-base font-bold text-ink">Acesso</h3>
          {statusError && <Alert tone="error">{statusError}</Alert>}
          {!user.active ? (
            <Button
              variant="secondary"
              className="self-start"
              icon={<RotateCcw aria-hidden="true" className="size-4" />}
              loading={setActive.isPending}
              disabled={pending}
              onClick={() => setActive.mutate(true)}
            >
              Reativar usuário
            </Button>
          ) : confirmingDeactivate ? (
            <div className="flex flex-col gap-2 rounded-xl border border-danger/40 bg-danger-soft p-3">
              <p className="text-sm font-semibold text-danger">
                Desativar {user.name}? A pessoa sai de todos os aparelhos agora e não consegue entrar até ser reativada. O que ela
                fez continua no histórico.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" loading={setActive.isPending} loadingText="Desativando…" disabled={pending} onClick={() => setActive.mutate(false)}>
                  Desativar
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingDeactivate(false)} disabled={pending}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button
                variant="secondary"
                className="self-start text-danger"
                icon={<UserX aria-hidden="true" className="size-4" />}
                disabled={pending || !!deactivateBlocked}
                onClick={() => {
                  setStatusError(null)
                  setConfirmingDeactivate(true)
                }}
              >
                Desativar usuário
              </Button>
              {deactivateBlocked && <p className="text-sm text-ink-muted">{deactivateBlocked}</p>}
            </>
          )}
        </section>
      </div>
    </Dialog>
  )
}
