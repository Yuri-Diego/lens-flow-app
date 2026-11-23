import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { WifiOff } from 'lucide-react'
import { api } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { useConnectivity } from './connectivity'

/**
 * Faixa "sem conexão": aparece quando o aparelho está offline ou a API não
 * respondeu. "Tentar de novo" confere o servidor e recarrega o que está na tela.
 */
export function OfflineBanner() {
  const { online, serverReachable } = useConnectivity()
  const queryClient = useQueryClient()
  const [checking, setChecking] = useState(false)

  if (online && serverReachable) return null

  async function retry() {
    setChecking(true)
    try {
      await api.get('/health')
      await Promise.all([
        queryClient.refetchQueries({ type: 'active' }),
        queryClient.resumePausedMutations(),
      ])
    } catch {
      // A faixa continua; o cliente da API já registrou a falha.
    } finally {
      setChecking(false)
    }
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-warning-soft px-4 py-2 text-warning md:px-6"
    >
      <WifiOff aria-hidden="true" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 text-sm font-semibold">
        {online ? 'Sem conexão com o servidor.' : 'Sem internet neste aparelho.'}{' '}
        <span className="font-normal">Confira a rede e tente de novo.</span>
      </p>
      <Button variant="secondary" onClick={retry} loading={checking} loadingText="Tentando…">
        Tentar de novo
      </Button>
    </div>
  )
}
