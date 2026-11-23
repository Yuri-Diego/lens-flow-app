import { AxiosError, AxiosHeaders, CanceledError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import { ApiError, NETWORK_MESSAGE, normalizeApiError } from './errors'

const config = { headers: new AxiosHeaders() } as InternalAxiosRequestConfig

function httpError(status: number, data: unknown, headers: Record<string, string> = {}) {
  const response: AxiosResponse = {
    status,
    statusText: '',
    data,
    headers: new AxiosHeaders(headers),
    config,
  }
  return new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, null, response)
}

describe('normalizeApiError', () => {
  it('usa code, message, fields e details do corpo de erro do contrato', () => {
    const error = normalizeApiError(
      httpError(400, {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Confira os campos destacados.',
          fields: { number: 'Use só dígitos no número da caixa.', 'numbers.2': 'Número inválido.' },
        },
      }),
    )

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      code: 'VALIDATION_ERROR',
      message: 'Confira os campos destacados.',
      status: 400,
      fields: { number: 'Use só dígitos no número da caixa.', 'numbers.2': 'Número inválido.' },
      details: null,
    })
  })

  it('mantém details do BOX_OCCUPIED', () => {
    const box = { id: 'b1', number: '007', color: 'azul' }
    const error = normalizeApiError(
      httpError(409, { error: { code: 'BOX_OCCUPIED', message: 'A caixa está ocupada.', details: { box } } }),
    )

    expect(error.code).toBe('BOX_OCCUPIED')
    expect(error.details).toEqual({ box })
    expect(error.fields).toEqual({})
  })

  it('traz a mensagem de credenciais inválidas como veio', () => {
    const error = normalizeApiError(
      httpError(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Usuário ou senha inválidos.' } }),
    )
    expect(error).toMatchObject({ code: 'INVALID_CREDENTIALS', message: 'Usuário ou senha inválidos.', status: 401 })
  })

  it('lê o Retry-After do 429', () => {
    const error = normalizeApiError(
      httpError(
        429,
        { error: { code: 'RATE_LIMITED', message: 'Muitas tentativas. Aguarde 15 min e tente de novo.' } },
        { 'retry-after': '900' },
      ),
    )
    expect(error).toMatchObject({ code: 'RATE_LIMITED', retryAfter: 900 })
  })

  it('ignora fields que não são texto', () => {
    const error = normalizeApiError(
      httpError(400, { error: { code: 'VALIDATION_ERROR', message: 'x', fields: { a: 'ok', b: 3, c: null } } }),
    )
    expect(error.fields).toEqual({ a: 'ok' })
  })

  it('sem resposta do servidor vira NETWORK_ERROR', () => {
    const error = normalizeApiError(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config))
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', message: NETWORK_MESSAGE, status: null })
    expect(error.isNetworkError).toBe(true)
  })

  it('proxy ou servidor fora do ar (502, 503, 504) também é falta de conexão', () => {
    expect(normalizeApiError(httpError(502, '')).code).toBe('NETWORK_ERROR')
    expect(normalizeApiError(httpError(504, '<html>Gateway Timeout</html>')).code).toBe('NETWORK_ERROR')
  })

  it('resposta sem o corpo do contrato recebe código e mensagem pelo status', () => {
    expect(normalizeApiError(httpError(500, '<html>erro</html>'))).toMatchObject({
      code: 'INTERNAL',
      status: 500,
      message: 'O servidor teve um problema. Tente de novo em instantes.',
    })
    expect(normalizeApiError(httpError(413, ''))).toMatchObject({ code: 'PAYLOAD_TOO_LARGE', status: 413 })
    expect(normalizeApiError(httpError(401, null))).toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('cancelamento e erro qualquer também ficam no formato', () => {
    expect(normalizeApiError(new CanceledError()).code).toBe('CANCELED')
    expect(normalizeApiError(new TypeError('boom'))).toMatchObject({
      code: 'INTERNAL',
      message: 'Algo deu errado. Tente de novo.',
      fields: {},
    })
  })

  it('devolve o mesmo ApiError se já estiver normalizado', () => {
    const original = new ApiError({ code: 'CONFLICT', message: 'Conflito.' })
    expect(normalizeApiError(original)).toBe(original)
  })
})
