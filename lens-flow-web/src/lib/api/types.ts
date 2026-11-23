// Tipos do contrato da API (docs/api/CONTRATO.md, seção 1.3).

export type Role = 'admin' | 'operator'

export type BoxColor = 'branca' | 'preta' | 'verde' | 'amarela' | 'vermelha' | 'azul'

export type BoxCategory = 'without_assembly' | 'with_assembly' | 'urgent' | 'with_treatment'

export interface SessionUser {
  id: string
  name: string
  username: string
  role: Role
  business: { id: string; name: string }
}

export interface UserRef {
  id: string
  name: string
}

export interface BoxMovementSummary {
  id: string
  clientName: string
  orderService: string | null
  status: 'open' | 'out'
  sheetDate: string
  createdAt: string
  createdBy: UserRef
}

export interface Box {
  id: string
  /** Sempre texto: "007" e "7" são caixas diferentes (D18). Nunca converta para número. */
  number: string
  color: BoxColor
  colorLabel: string
  category: BoxCategory
  categoryLabel: string
  state: 'free' | 'occupied'
  active: boolean
  currentMovement: BoxMovementSummary | null
  createdAt: string
  updatedAt: string
}

/** Códigos de erro do contrato, mais os do próprio web (rede e cancelamento). */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BOX_OCCUPIED'
  | 'CONFLICT'
  | 'DUPLICATE_IN_BATCH'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'INTERNAL'
  | 'NETWORK_ERROR'
  | 'CANCELED'
