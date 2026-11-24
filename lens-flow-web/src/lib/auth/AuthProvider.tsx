import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as authApi from '@/features/auth/api'
import { setUnauthenticatedHandler, type ApiError, type SessionUser } from '@/lib/api'
import { clearDraftsOf } from '@/lib/draft/drafts'
import { rememberRecentUser } from './recentUsers'

export const ME_QUERY_KEY = ['auth', 'me'] as const

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

export type SessionEndReason = 'signout' | 'switch' | 'expired'

export interface AuthContextValue {
  status: AuthStatus
  user: SessionUser | null
  /** Erro ao conferir a sessão (por exemplo, sem conexão). */
  error: ApiError | null
  /** Aviso para a tela de login, como "Sua sessão expirou. Entre de novo.". */
  notice: string | null
  /** Último usuário desta aba, mesmo depois de a sessão cair (rascunhos, R17). */
  lastUserId: string | null
  /** Por que a sessão terminou nesta aba, para a rota protegida montar o login. */
  endReason: SessionEndReason | null
  login: (credentials: authApi.Credentials) => Promise<SessionUser>
  /**
   * "Sair" (`signout`) apaga os rascunhos e vai ao login sem rota de volta;
   * "Trocar usuário" (`switch`) mantém os rascunhos e volta à mesma tela (R16).
   */
  logout: (reason: 'signout' | 'switch') => Promise<void>
  clearNotice: () => void
  retry: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<string | null>(null)
  const [lastUserId, setLastUserId] = useState<string | null>(null)
  const [endReason, setEndReason] = useState<SessionEndReason | null>(null)

  const meQuery = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: authApi.fetchMe,
    staleTime: Infinity,
  })

  const user = meQuery.data ?? null

  useEffect(() => {
    if (user) setLastUserId(user.id)
  }, [user])

  // Sessão vencida ou encerrada em qualquer chamada: volta ao login com aviso.
  // A rota atual fica guardada pelo RequireAuth.
  useEffect(() => {
    setUnauthenticatedHandler((error) => {
      if (!queryClient.getQueryData(ME_QUERY_KEY)) return
      setNotice(error.message)
      setEndReason('expired')
      queryClient.setQueryData(ME_QUERY_KEY, null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    })
    return () => setUnauthenticatedHandler(null)
  }, [queryClient])

  const login = useCallback(
    async (credentials: authApi.Credentials) => {
      const sessionUser = await authApi.login(credentials)
      rememberRecentUser(sessionUser)
      setNotice(null)
      setEndReason(null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
      queryClient.setQueryData(ME_QUERY_KEY, sessionUser)
      return sessionUser
    },
    [queryClient],
  )

  const logout = useCallback(
    async (reason: 'signout' | 'switch') => {
      const current = queryClient.getQueryData<SessionUser | null>(ME_QUERY_KEY)
      // Só sai na tela depois de o servidor apagar o cookie: num aparelho
      // compartilhado, "sair" que não saiu deixaria a sessão aberta.
      await authApi.logout()
      if (reason === 'signout' && current) clearDraftsOf(current.id)
      setNotice(null)
      setEndReason(reason)
      queryClient.setQueryData(ME_QUERY_KEY, null)
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'auth' })
    },
    [queryClient],
  )

  const clearNotice = useCallback(() => setNotice(null), [])
  const { refetch } = meQuery
  const retry = useCallback(() => {
    void refetch()
  }, [refetch])

  let status: AuthStatus
  if (meQuery.isPending) status = 'loading'
  else if (meQuery.isError && meQuery.data === undefined) status = 'error'
  else status = user ? 'authenticated' : 'anonymous'

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error: (meQuery.error as ApiError | null) ?? null,
      notice,
      lastUserId,
      endReason,
      login,
      logout,
      clearNotice,
      retry,
    }),
    [status, user, meQuery.error, notice, lastUserId, endReason, login, logout, clearNotice, retry],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.')
  return context
}
