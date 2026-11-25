import { expect, type APIRequestContext, type APIResponse } from '@playwright/test'
import type { Lab, LabUser } from './lab'

export interface ApiMovement {
  id: string
  sheetDate: string
  clientName: string
  status: 'open' | 'out'
  box: { id: string; number: string }
  createdBy: { id: string; name: string }
}

/** A API com a sessão de um usuário: prepara o estado e confere o que a tela não mostra. */
export class ApiUser {
  constructor(
    readonly request: APIRequestContext,
    private readonly lab: Lab,
  ) {}

  async login(user: LabUser): Promise<void> {
    const response = await this.request.post('/api/auth/login', {
      data: { username: user.username, password: user.password },
    })
    expect(response.status(), `login de ${user.username}`).toBe(200)
  }

  async launch(boxNumber: string, clientName: string, orderService?: string): Promise<ApiMovement> {
    const response = await this.request.post('/api/movements', {
      data: { boxId: this.lab.boxes[boxNumber], clientName, orderService },
    })
    expect(response.status(), `lançar na caixa ${boxNumber}`).toBe(201)
    return (await response.json()).movement
  }

  async checkout(movementId: string): Promise<void> {
    expect((await this.request.post(`/api/movements/${movementId}/checkout`)).status()).toBe(200)
  }

  async release(movementId: string): Promise<void> {
    expect((await this.request.post(`/api/movements/${movementId}/release-box`)).status()).toBe(200)
  }

  /** Os serviços abertos de um cliente: para conferir que nada entrou duas vezes nem em nome errado. */
  async openMovementsOf(clientName: string): Promise<ApiMovement[]> {
    const response = await this.request.get('/api/movements', { params: { status: 'open', limit: 100 } })
    expect(response.status()).toBe(200)
    const { items } = (await response.json()) as { items: ApiMovement[] }
    return items.filter((item) => item.clientName === clientName)
  }

  async movement(movementId: string): Promise<ApiMovement> {
    const response = await this.request.get(`/api/movements/${movementId}`)
    expect(response.status()).toBe(200)
    return (await response.json()).movement
  }

  async boxState(boxNumber: string): Promise<string> {
    const response = await this.request.get(`/api/boxes/${this.lab.boxes[boxNumber]}`)
    expect(response.status()).toBe(200)
    return (await response.json()).box.state
  }
}

/** Confere o status e o código de erro do contrato (seção 1.1). */
export async function expectApiError(response: APIResponse, status: number, code: string): Promise<void> {
  expect(response.status()).toBe(status)
  expect((await response.json()).error.code).toBe(code)
}
