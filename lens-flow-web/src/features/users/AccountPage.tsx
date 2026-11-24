import { useState, type FormEvent } from 'react'
import { useMutation } from '@tanstack/react-query'
import { normalizeApiError, type FieldErrors } from '@/lib/api'
import { useAuth } from '@/lib/auth/AuthProvider'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { PasswordField } from '@/components/ui/PasswordField'
import { useToast } from '@/components/ui/Toast'
import { changeOwnPassword, PASSWORD_MAX, PASSWORD_MIN, ROLE_LABELS, validatePassword } from './api'

interface Form {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

const EMPTY: Form = { currentPassword: '', newPassword: '', confirmPassword: '' }

function validate(form: Form): FieldErrors {
  const errors: FieldErrors = {}
  if (!form.currentPassword) errors.currentPassword = 'Digite a sua senha atual.'
  const newError = validatePassword(form.newPassword)
  if (newError) errors.newPassword = newError
  else if (form.newPassword === form.currentPassword) errors.newPassword = 'A senha nova precisa ser diferente da atual.'
  if (!errors.newPassword && form.confirmPassword !== form.newPassword) errors.confirmPassword = 'As duas senhas novas não são iguais.'
  return errors
}

/** Minha conta: os dados da sessão e a troca da própria senha (RN-14, contrato 3.5). */
export function AccountPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})

  const mutation = useMutation({
    mutationFn: (input: Form) => changeOwnPassword(input.currentPassword, input.newPassword),
    onSuccess: () => {
      setForm(EMPTY)
      setErrors({})
      toast.show({ tone: 'success', message: 'Senha trocada. Os outros aparelhos saíram da sua conta; este continua.' })
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      setErrors(Object.keys(apiError.fields).length ? apiError.fields : { form: apiError.message })
    },
  })

  function update(field: keyof Form, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field] || errors.form) setErrors((current) => ({ ...current, [field]: '', form: '' }))
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const next = validate(form)
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate(form)
  }

  return (
    <section className="flex max-w-lg flex-col gap-4">
      <PageHeader title="Minha conta" description="Seus dados e a troca da sua senha." />

      {user && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-line bg-surface p-4 text-base">
          <dt className="text-ink-muted">Nome</dt>
          <dd className="font-semibold text-ink">{user.name}</dd>
          <dt className="text-ink-muted">Usuário</dt>
          <dd className="font-mono text-ink">{user.username}</dd>
          <dt className="text-ink-muted">Perfil</dt>
          <dd className="text-ink">{ROLE_LABELS[user.role]}</dd>
          <dt className="text-ink-muted">Empresa</dt>
          <dd className="text-ink">{user.business.name}</dd>
        </dl>
      )}

      <form noValidate onSubmit={onSubmit} aria-label="Trocar senha" className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-lg font-bold text-ink">Trocar senha</h2>
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        {/* Ajuda o gerenciador de senhas a guardar a senha nova no usuário certo. */}
        <input type="text" name="username" autoComplete="username" value={user?.username ?? ''} readOnly hidden />
        <PasswordField
          label="Senha atual"
          value={form.currentPassword}
          onChange={(event) => update('currentPassword', event.target.value)}
          error={errors.currentPassword || undefined}
          autoComplete="current-password"
          enterKeyHint="next"
        />
        <PasswordField
          label="Senha nova"
          value={form.newPassword}
          onChange={(event) => update('newPassword', event.target.value)}
          error={errors.newPassword || undefined}
          hint={`De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres.`}
          autoComplete="new-password"
          enterKeyHint="next"
          maxLength={PASSWORD_MAX}
        />
        <PasswordField
          label="Repita a senha nova"
          value={form.confirmPassword}
          onChange={(event) => update('confirmPassword', event.target.value)}
          error={errors.confirmPassword || undefined}
          autoComplete="new-password"
          enterKeyHint="done"
          maxLength={PASSWORD_MAX}
        />
        <Button type="submit" size="lg" loading={mutation.isPending} loadingText="Trocando…" className="self-start">
          Trocar senha
        </Button>
      </form>
    </section>
  )
}
