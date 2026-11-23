import { useState } from 'react'
import { normalizeApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from './AuthProvider'

/**
 * "Trocar usuário" e "Sair" (D12, R16), usados no cabeçalho e no "Mais".
 * Quem leva ao login é a rota protegida, quando a sessão sai do contexto.
 */
export function useSessionActions() {
  const { logout } = useAuth()
  const toast = useToast()
  const [pending, setPending] = useState<'switch' | 'signout' | null>(null)

  async function run(reason: 'switch' | 'signout') {
    if (pending) return
    setPending(reason)
    try {
      await logout(reason)
    } catch (error) {
      toast.show({ tone: 'error', message: `Não foi possível sair. ${normalizeApiError(error).message}` })
    } finally {
      setPending(null)
    }
  }

  return {
    pending,
    switchUser: () => run('switch'),
    signOut: () => run('signout'),
  }
}
