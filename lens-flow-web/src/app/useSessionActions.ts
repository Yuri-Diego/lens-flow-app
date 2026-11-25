import { createContext, useContext } from 'react'

export interface SessionActions {
  pending: 'switch' | 'signout' | null
  switchUser: () => void
  signOut: () => void
}

export const SessionActionsContext = createContext<SessionActions | null>(null)

/** "Trocar usuário" e "Sair" (D12, R16), usados no cabeçalho e no "Mais". */
export function useSessionActions(): SessionActions {
  const context = useContext(SessionActionsContext)
  if (!context) throw new Error('useSessionActions precisa estar dentro de <SessionActionsProvider>.')
  return context
}
