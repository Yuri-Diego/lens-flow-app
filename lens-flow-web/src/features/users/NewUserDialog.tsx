import { useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { normalizeApiError, type FieldErrors, type Role } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextField } from '@/components/ui/TextField'
import { useToast } from '@/components/ui/Toast'
import { createUser, userKeys, validatePassword, validatePersonName, validateUsername } from './api'
import { RolePicker, TemporaryPasswordField } from './fields'

interface Form {
  name: string
  username: string
  password: string
  role: Role
}

const EMPTY: Form = { name: '', username: '', password: '', role: 'operator' }

/** As regras do contrato (1.2 e 3.13), antes de enviar. */
function validateNewUser(form: Form): FieldErrors {
  const errors: FieldErrors = {}
  const name = validatePersonName(form.name)
  const username = validateUsername(form.username)
  const password = validatePassword(form.password)
  if (name) errors.name = name
  if (username) errors.username = username
  if (password) errors.password = password
  return errors
}

/** Novo usuário (admin): nome, usuário, senha temporária e perfil. */
export function NewUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Form>(EMPTY)
  const [errors, setErrors] = useState<FieldErrors>({})

  const mutation = useMutation({
    mutationFn: (input: Form) =>
      createUser({ name: input.name.trim(), username: input.username.trim().toLowerCase(), password: input.password, role: input.role }),
    onSuccess: (user) => {
      void queryClient.invalidateQueries({ queryKey: userKeys.all })
      toast.show({
        tone: 'success',
        duration: 10_000,
        message: `${user.name} pode entrar com o usuário "${user.username}" e a senha temporária que você definiu.`,
      })
      setForm(EMPTY)
      setErrors({})
      onClose()
    },
    onError: (error) => {
      const apiError = normalizeApiError(error)
      setErrors(Object.keys(apiError.fields).length ? apiError.fields : { form: apiError.message })
    },
  })

  function update<K extends keyof Form>(field: K, value: Form[K]) {
    setForm((current) => ({ ...current, [field]: value }))
    if (errors[field] || errors.form) setErrors((current) => ({ ...current, [field]: '', form: '' }))
  }

  function close() {
    if (mutation.isPending) return
    setErrors({})
    onClose()
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (mutation.isPending) return
    const next = validateNewUser(form)
    setErrors(next)
    if (Object.keys(next).length === 0) mutation.mutate(form)
  }

  return (
    <Dialog
      open={open}
      title="Novo usuário"
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="new-user-form" loading={mutation.isPending} loadingText="Criando…">
            Criar usuário
          </Button>
        </>
      }
    >
      <form id="new-user-form" noValidate onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Novo usuário">
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <TextField
          label="Nome"
          value={form.name}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name || undefined}
          autoCapitalize="words"
          autoComplete="off"
          enterKeyHint="next"
          maxLength={80}
        />
        <TextField
          label="Usuário"
          value={form.username}
          onChange={(event) => update('username', event.target.value.toLowerCase().replace(/\s/g, ''))}
          error={errors.username || undefined}
          hint="Para entrar. De 3 a 30: letras sem acento, números, ponto, _ ou -."
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={30}
        />
        <TemporaryPasswordField
          label="Senha temporária"
          value={form.password}
          onChange={(value) => update('password', value)}
          error={errors.password || undefined}
        />
        <RolePicker value={form.role} onChange={(role) => update('role', role)} error={errors.role || undefined} />
      </form>
    </Dialog>
  )
}
