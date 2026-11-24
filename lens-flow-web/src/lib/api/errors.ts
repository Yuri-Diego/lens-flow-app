import { isAxiosError, isCancel } from 'axios'
import type { ApiErrorCode } from './types'

export type FieldErrors = Record<string, string>

/** Erro normalizado: toda falha de chamada à API chega à tela neste formato. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | (string & {})
  readonly status: number | null
  readonly fields: FieldErrors
  readonly details: Record<string, unknown> | null
  /** Segundos do cabeçalho Retry-After (429), quando houver. */
  readonly retryAfter: number | null

  constructor(init: {
    code: ApiError['code']
    message: string
    status?: number | null
    fields?: FieldErrors
    details?: Record<string, unknown> | null
    retryAfter?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.code = init.code
    this.status = init.status ?? null
    this.fields = init.fields ?? {}
    this.details = init.details ?? null
    this.retryAfter = init.retryAfter ?? null
  }

  /** Falha de conexão: o servidor não respondeu ou não está acessível. */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR'
  }
}

export const NETWORK_MESSAGE = 'Sem conexão com o servidor. Confira a internet e tente de novo.'
const GENERIC_MESSAGE = 'Algo deu errado. Tente de novo.'

const FALLBACK_BY_STATUS: Record<number, { code: ApiErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'Confira os campos destacados.' },
  401: { code: 'UNAUTHENTICATED', message: 'Entre com seu usuário e senha para continuar.' },
  403: { code: 'FORBIDDEN', message: 'Você não tem permissão para fazer isso.' },
  404: { code: 'NOT_FOUND', message: 'Não encontramos o que você procurou.' },
  409: { code: 'CONFLICT', message: 'Não foi possível concluir por causa de um conflito. Atualize e tente de novo.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Os dados enviados são grandes demais.' },
  429: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde um pouco e tente de novo.' },
}

// Proxy ou servidor fora do ar: tratado como falta de conexão.
const UNAVAILABLE_STATUSES = new Set([502, 503, 504])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toFieldErrors(value: unknown): FieldErrors {
  if (!isRecord(value)) return {}
  const fields: FieldErrors = {}
  for (const [key, message] of Object.entries(value)) {
    if (typeof message === 'string') fields[key] = message
  }
  return fields
}

function parseRetryAfter(value: unknown): number | null {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null
}

/** Converte qualquer falha (axios, rede, erro inesperado) em `ApiError` `{code, message, fields}`. */
export function normalizeApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error

  if (isCancel(error)) {
    return new ApiError({ code: 'CANCELED', message: 'A requisição foi cancelada.' })
  }

  if (isAxiosError(error)) {
    const response = error.response
    if (!response) {
      return new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_MESSAGE })
    }

    const { status } = response
    const body = isRecord(response.data) ? response.data.error : undefined
    const retryAfter = parseRetryAfter(response.headers?.['retry-after'])

    if (isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string') {
      return new ApiError({
        code: body.code,
        message: body.message,
        status,
        fields: toFieldErrors(body.fields),
        details: isRecord(body.details) ? body.details : null,
        retryAfter,
      })
    }

    if (UNAVAILABLE_STATUSES.has(status)) {
      return new ApiError({ code: 'NETWORK_ERROR', message: NETWORK_MESSAGE, status })
    }

    const fallback = FALLBACK_BY_STATUS[status] ?? {
      code: 'INTERNAL' as const,
      message: 'O servidor teve um problema. Tente de novo em instantes.',
    }
    return new ApiError({ ...fallback, status, retryAfter })
  }

  return new ApiError({ code: 'INTERNAL', message: GENERIC_MESSAGE })
}
