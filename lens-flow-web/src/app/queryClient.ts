import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/lib/api'

const MAX_RETRIES = 2

/** Repete só falha de rede ou do servidor; erro 4xx é resposta definitiva. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status !== null && error.status < 500) return false
  return failureCount < MAX_RETRIES
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: shouldRetry, staleTime: 30_000 },
      mutations: { retry: false },
    },
  })
}
