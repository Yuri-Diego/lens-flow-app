import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { LogIn, UserRound } from 'lucide-react'
import { normalizeApiError, type ApiError, type FieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import type { LoginLocationState } from '@/lib/auth/guards'
import { getRecentUsers, type RecentUser } from '@/lib/auth/recentUsers'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PasswordField } from '@/components/ui/PasswordField'
import { TextField } from '@/components/ui/TextField'
import type { Credentials } from './api'

function validate({ username, password }: Credentials): FieldErrors {
  const errors: FieldErrors = {}
  if (!username.trim()) errors.username = 'Informe seu usuário.'
  if (!password) errors.password = 'Informe sua senha.'
  return errors
}

function targetFrom(state: LoginLocationState | null) {
  const from = state?.from
  if (!from || from.pathname === '/login') return '/hoje'
  return from
}

export function LoginPage() {
  const { status, login, notice, clearNotice } = useAuth()
  const location = useLocation()
  const state = (location.state as LoginLocationState | null) ?? null

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<ApiError | null>(null)
  const [recentUsers] = useState<RecentUser[]>(getRecentUsers)
  const usernameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Entrar · Lens Flow'
  }, [])

  const mutation = useMutation({
    // Sem navegar aqui: quando a sessão entra no contexto, o <Navigate> abaixo
    // leva à rota pedida (navegar antes faria a rota protegida ver a sessão antiga).
    mutationFn: login,
    onError: (error) => {
      const apiError = normalizeApiError(error)
      setFieldErrors(apiError.fields)
      setFormError(Object.keys(apiError.fields).length > 0 ? null : apiError)
      if (apiError.fields.username) usernameRef.current?.focus()
      else passwordRef.current?.focus()
    },
  })

  if (status === 'authenticated') {
    return <Navigate to={targetFrom(state)} replace />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mutation.isPending) return
    const credentials = { username: username.trim(), password }
    const errors = validate(credentials)
    setFieldErrors(errors)
    setFormError(null)
    if (errors.username) return usernameRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()
    clearNotice()
    mutation.mutate(credentials)
  }

  function pickRecentUser(user: RecentUser) {
    setUsername(user.username)
    setFieldErrors((current) => ({ ...current, username: '' }))
    passwordRef.current?.focus()
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-safe pb-safe pt-safe">
      <div className="w-full max-w-sm py-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl bg-primary text-xl font-bold text-ink-inverse">
            LF
          </span>
          <div>
            <h1 className="text-2xl font-bold text-ink">{state?.switchUser ? 'Trocar usuário' : 'Lens Flow'}</h1>
            <p className="mt-1 text-base text-ink-muted">
              {state?.switchUser ? 'Quem vai usar o aparelho agora?' : 'Entre com seu usuário e senha.'}
            </p>
          </div>
        </div>

        {notice && (
          <Alert tone="warning" className="mb-4">
            {notice}
          </Alert>
        )}

        {recentUsers.length > 0 && (
          <div className="mb-4">
            <p id="recent-users-label" className="mb-2 text-sm font-semibold text-ink">
              Entraram neste aparelho
            </p>
            <ul aria-labelledby="recent-users-label" className="flex flex-wrap gap-2">
              {recentUsers.map((user) => (
                <li key={user.username}>
                  <button
                    type="button"
                    onClick={() => pickRecentUser(user)}
                    aria-pressed={username === user.username}
                    className="focus-ring inline-flex min-h-touch items-center gap-2 rounded-full border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-muted aria-pressed:border-primary aria-pressed:bg-primary-soft aria-pressed:text-primary"
                  >
                    <UserRound aria-hidden="true" className="size-4" />
                    {user.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          {formError && (
            <Alert tone={formError.code === 'RATE_LIMITED' ? 'warning' : 'error'}>{formError.message}</Alert>
          )}

          <TextField
            ref={usernameRef}
            label="Usuário"
            name="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            error={fieldErrors.username || undefined}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            autoFocus={recentUsers.length === 0}
          />

          <PasswordField
            ref={passwordRef}
            label="Senha"
            name="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            error={fieldErrors.password || undefined}
            autoComplete="current-password"
            enterKeyHint="go"
            maxLength={64}
          />

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={mutation.isPending}
            loadingText="Entrando…"
            icon={<LogIn aria-hidden="true" className="size-5" />}
          >
            Entrar
          </Button>
        </form>
      </div>
    </main>
  )
}
