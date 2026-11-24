import { api, type Role, type User } from '@/lib/api'

/** Um usuário da empresa para filtros (`GET /api/users/options`), também os inativos. */
export interface UserOption {
  id: string
  name: string
  active: boolean
}

export const userKeys = {
  all: ['users'] as const,
  list: () => ['users', 'list'] as const,
  options: () => ['users', 'options'] as const,
}

/** Todos os usuários da empresa, por nome; qualquer pessoa logada pode ver. */
export async function fetchUserOptions(): Promise<UserOption[]> {
  const { data } = await api.get<{ items: UserOption[] }>('/users/options')
  return data.items
}

/** Gestão de usuários (admin, contrato 3.12). */
export async function fetchUsers(): Promise<User[]> {
  const { data } = await api.get<{ users: User[] }>('/users')
  return data.users
}

export interface NewUserInput {
  name: string
  username: string
  password: string
  role: Role
}

export async function createUser(input: NewUserInput): Promise<User> {
  const { data } = await api.post<{ user: User }>('/users', input)
  return data.user
}

export async function updateUser(id: string, input: Partial<Pick<User, 'name' | 'role' | 'active'>>): Promise<User> {
  const { data } = await api.patch<{ user: User }>(`/users/${id}`, input)
  return data.user
}

export async function resetUserPassword(id: string, password: string): Promise<void> {
  await api.post(`/users/${id}/reset-password`, { password })
}

export async function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.patch('/auth/password', { currentPassword, newPassword })
}

/** As regras do contrato (1.2), para avisar antes de enviar. */
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 64

export function validatePassword(value: string): string | null {
  if (!value) return 'Digite a senha.'
  if (value.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (value.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`
  if (new TextEncoder().encode(value).length > 72) return 'A senha ficou longa demais. Use menos acentos ou símbolos.'
  return null
}

export function validateUsername(value: string): string | null {
  const username = value.trim().toLowerCase()
  if (!username) return 'Digite o usuário.'
  if (username.length < 3) return 'O usuário precisa ter pelo menos 3 caracteres.'
  if (username.length > 30) return 'O usuário pode ter no máximo 30 caracteres.'
  if (!/^[a-z0-9]/.test(username)) return 'Comece o usuário com letra ou número.'
  if (!/^[a-z0-9._-]+$/.test(username)) return 'Use só letras sem acento, números, ponto, _ e -.'
  return null
}

export function validatePersonName(value: string): string | null {
  const name = value.trim()
  if (!name) return 'Digite o nome.'
  if (name.length > 80) return 'O nome pode ter no máximo 80 caracteres.'
  return null
}

export const ROLE_LABELS: Record<Role, string> = { admin: 'Administrador', operator: 'Operador' }

// Sem letras e números que se confundem (0/O, 1/l/I), para ditar no balcão.
const PASSWORD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Senha temporária de 10 caracteres, para o admin passar à pessoa. */
export function generateTemporaryPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => PASSWORD_ALPHABET[byte % PASSWORD_ALPHABET.length]).join('')
}
