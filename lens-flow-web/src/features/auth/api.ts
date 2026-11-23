import { api, ApiError, type SessionUser } from '@/lib/api'

export interface Credentials {
  username: string
  password: string
}

export async function login(credentials: Credentials): Promise<SessionUser> {
  const { data } = await api.post<{ user: SessionUser }>('/auth/login', credentials)
  return data.user
}

/** Público e sempre 204 (contrato 3.3): serve para "Sair" e "Trocar usuário". */
export async function logout(): Promise<void> {
  await api.post('/auth/logout')
}

/** Usuário da sessão, ou `null` sem sessão válida. */
export async function fetchMe(): Promise<SessionUser | null> {
  try {
    const { data } = await api.get<{ user: SessionUser }>('/auth/me')
    return data.user
  } catch (error) {
    if (error instanceof ApiError && error.code === 'UNAUTHENTICATED') return null
    throw error
  }
}
