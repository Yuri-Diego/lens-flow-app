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

/** Caixa como está no serviço (contrato 5.1). */
export interface MovementBox {
  id: string
  number: string
  color: BoxColor
  colorLabel: string
  category: BoxCategory
  categoryLabel: string
}

/** Nível de atraso (D15), calculado no servidor. */
export type DelayLevel = 'neutral' | 'normal' | 'attention' | 'late'

export type MovementStatus = 'open' | 'out'

export type UndoAction = 'checkout' | 'release-box'

export type BatchAction = 'checkout' | 'release-box' | 'checkout-and-release'

export type MovementSort = 'priority' | 'box' | 'recent' | 'oldest'

export interface Movement {
  id: string
  sheetDate: string
  box: MovementBox
  clientName: string
  orderService: string | null
  note: string | null
  status: MovementStatus
  daysOpen: number | null
  delayLevel: DelayLevel | null
  createdBy: UserRef
  createdAt: string
  outBy: UserRef | null
  outAt: string | null
  outDate: string | null
  boxReleasedBy: UserRef | null
  boxReleasedAt: string | null
  updatedAt: string
  /** Editar e excluir (RN-11): autor no mesmo dia, ou admin. */
  canEdit: boolean
  /** Trocar a caixa (D19): qualquer pessoa, enquanto o serviço está aberto. */
  canChangeBox: boolean
  /** O que quem está logado ainda pode desfazer; `until` é `null` para o admin. */
  undo: { action: UndoAction; until: string | null } | null
}

export interface MovementWarning {
  code: 'DUPLICATE_ORDER_SERVICE' | (string & {})
  message: string
  movements?: Array<Pick<Movement, 'id' | 'box' | 'sheetDate' | 'clientName' | 'createdBy'>>
}

export interface MovementPage {
  items: Movement[]
  nextCursor: string | null
  serverDate: string
}

export interface MovementSummary {
  serverDate: string
  counts: {
    launchedToday: number
    open: number
    pendingFromPreviousDays: number
    attention: number
    late: number
    outNotReleased: number
  }
}

export interface HistoryEvent {
  id: string
  action: string
  at: string
  user: UserRef | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

export interface BatchItemResult {
  id: string
  ok: boolean
  movement?: Movement
  error?: { code: ApiErrorCode | (string & {}); message: string }
}

export interface BatchResult {
  batchId: string
  action?: BatchAction
  results: BatchItemResult[]
  summary: { requested: number; succeeded: number; failed: number }
}

export interface SheetCounts {
  launched: number
  out: number
  open: number
}

export interface SheetSummary {
  date: string
  counts: SheetCounts
}
