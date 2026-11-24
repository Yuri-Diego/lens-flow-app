import { RotateCw } from 'lucide-react'
import { normalizeApiError } from '@/lib/api'
import { Alert } from './Alert'
import { Button } from './Button'

/** Erro ao carregar uma lista ou tela, com "Tentar de novo". */
export function ErrorState({ error, onRetry, title = 'Não foi possível carregar.' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <Alert
      tone="error"
      title={title}
      action={
        onRetry && (
          <Button variant="secondary" onClick={onRetry} icon={<RotateCw aria-hidden="true" className="size-4" />}>
            Tentar de novo
          </Button>
        )
      }
    >
      {normalizeApiError(error).message}
    </Alert>
  )
}

/** "Carregar mais" das listas com cursor. */
export function LoadMoreButton({
  hasNextPage,
  isFetchingNextPage,
  onClick,
}: {
  hasNextPage: boolean
  isFetchingNextPage: boolean
  onClick: () => void
}) {
  if (!hasNextPage) return null
  return (
    <div className="mt-3 flex justify-center">
      <Button variant="secondary" onClick={onClick} loading={isFetchingNextPage} loadingText="Carregando…">
        Carregar mais
      </Button>
    </div>
  )
}
