import { KeyRound } from 'lucide-react'
import type { Role } from '@/lib/api'
import { cn } from '@/lib/cn'
import { TextField } from '@/components/ui/TextField'
import { generateTemporaryPassword, PASSWORD_MAX, PASSWORD_MIN, ROLE_LABELS } from './api'

const ROLE_HINTS: Record<Role, string> = {
  operator: 'Lança, dá baixa, libera e corrige o próprio lançamento.',
  admin: 'Tudo do operador, mais caixas, usuários e correções de qualquer lançamento.',
}

/** Perfil (RN-13): dois rádios grandes, com o que cada um pode fazer. */
export function RolePicker({
  value,
  onChange,
  disabledReason,
  error,
}: {
  value: Role
  onChange: (role: Role) => void
  /** Quando o perfil não pode mudar (último admin), diz por quê. */
  disabledReason?: string
  error?: string
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={!!disabledReason}>
      <legend className="mb-1.5 text-sm font-semibold text-ink">Perfil</legend>
      {(['operator', 'admin'] as const).map((role) => (
        <label
          key={role}
          className={cn(
            'flex min-h-touch cursor-pointer items-start gap-3 rounded-xl border-2 p-3',
            value === role ? 'border-primary bg-primary-soft' : 'border-line',
            disabledReason && 'cursor-not-allowed opacity-70',
          )}
        >
          <input
            type="radio"
            name="role"
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <span className="flex flex-col">
            <span className="font-semibold text-ink">{ROLE_LABELS[role]}</span>
            <span className="text-sm text-ink-muted">{ROLE_HINTS[role]}</span>
          </span>
        </label>
      ))}
      {disabledReason && <p className="text-sm text-ink-muted">{disabledReason}</p>}
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  )
}

/**
 * Senha temporária que o admin passa para a pessoa. Fica visível (o admin
 * precisa ler para ditar) e há um botão para gerar uma fácil de ditar.
 */
export function TemporaryPasswordField({
  label,
  value,
  onChange,
  error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        error={error}
        hint={`De ${PASSWORD_MIN} a ${PASSWORD_MAX} caracteres. A pessoa pode trocar depois em "Minha conta".`}
        type="text"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        maxLength={PASSWORD_MAX}
        className="[&_input]:font-mono"
      />
      <button
        type="button"
        onClick={() => onChange(generateTemporaryPassword())}
        className="focus-ring inline-flex min-h-touch items-center gap-2 self-start rounded-xl px-2 text-sm font-semibold text-primary hover:bg-primary-soft"
      >
        <KeyRound aria-hidden="true" className="size-4" />
        Gerar senha
      </button>
    </div>
  )
}
