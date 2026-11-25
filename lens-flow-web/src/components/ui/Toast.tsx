import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastId = number | string
type ToastTone = 'info' | 'success' | 'error'

export interface ToastOptions {
  /** Para fechar o aviso depois, de qualquer tela. O mesmo `id` troca o aviso anterior. */
  id?: ToastId
  message: string
  tone?: ToastTone
  /** Ação do aviso, como "Desfazer". */
  action?: { label: string; onClick: () => void }
  /** Em milissegundos. Padrão: 5 s; com ação, 10 s (R7). `null`: fica até a pessoa fechar. */
  duration?: number | null
}

interface ToastItem extends ToastOptions {
  id: ToastId
}

interface ToastContextValue {
  show: (options: ToastOptions) => void
  dismiss: (id: ToastId) => void
  /** Altura extra (px) de uma barra fixa na base, para o aviso não cobrir os botões. */
  setBottomOffset: (px: number) => void
}

interface ToastInternals extends Omit<ToastContextValue, 'show'> {
  /** Cada sessão tem um número: aviso de uma sessão encerrada não aparece. */
  currentSession: () => number
  show: (options: ToastOptions, session: number) => void
  endSession: () => void
}

const ToastContext = createContext<ToastInternals | null>(null)

const DEFAULT_DURATION = 5_000
const ACTION_DURATION = 10_000
const MAX_VISIBLE = 3

const TONES: Record<ToastTone, { className: string; Icon: LucideIcon }> = {
  info: { className: 'bg-ink text-ink-inverse', Icon: Info },
  success: { className: 'bg-ink text-ink-inverse', Icon: CircleCheck },
  error: { className: 'bg-danger text-ink-inverse', Icon: CircleAlert },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [bottomOffset, setBottomOffset] = useState(0)
  const nextId = useRef(1)
  const session = useRef(0)

  const dismiss = useCallback((id: ToastId) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const currentSession = useCallback(() => session.current, [])

  const endSession = useCallback(() => {
    session.current += 1
    setToasts([])
  }, [])

  const show = useCallback((options: ToastOptions, shownIn: number) => {
    if (shownIn !== session.current) return
    const id = options.id ?? nextId.current++
    setToasts((current) => [...current.filter((toast) => toast.id !== id), { ...options, id }].slice(-MAX_VISIBLE))
  }, [])

  const value = useMemo(
    () => ({ show, dismiss, setBottomOffset, currentSession, endSession }),
    [show, dismiss, currentSession, endSession],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Avisos"
        style={bottomOffset ? { transform: `translateY(-${bottomOffset}px)` } : undefined}
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  )
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: ToastId) => void }) {
  const [paused, setPaused] = useState(false)
  const duration = toast.duration === undefined ? (toast.action ? ACTION_DURATION : DEFAULT_DURATION) : toast.duration
  const { className, Icon } = TONES[toast.tone ?? 'info']

  // Some sozinho, mas espera enquanto a pessoa está com o dedo, o mouse ou o foco nele.
  useEffect(() => {
    if (paused || duration === null) return
    const timer = window.setTimeout(() => onDismiss(toast.id), duration)
    return () => window.clearTimeout(timer)
  }, [paused, duration, onDismiss, toast.id])

  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl py-2 pl-4 pr-2 shadow-lg',
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-5 shrink-0" />
      <p className="min-w-0 flex-1 py-2 text-base wrap-break-word">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick()
            onDismiss(toast.id)
          }}
          className="focus-ring min-h-touch rounded-xl px-3 font-bold uppercase tracking-wide underline-offset-4 hover:underline"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Fechar aviso"
        className="focus-ring flex size-touch shrink-0 items-center justify-center rounded-xl opacity-80 hover:opacity-100"
      >
        <X aria-hidden="true" className="size-5" />
      </button>
    </div>
  )
}

/** Enquanto a tela estiver aberta, os avisos sobem acima da barra fixa dela. */
export function useToastBottomOffset(px: number): void {
  const { setBottomOffset } = useToast()
  useEffect(() => {
    setBottomOffset(px)
    return () => setBottomOffset(0)
  }, [px, setBottomOffset])
}

function useToastInternals(): ToastInternals {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return context
}

/**
 * Os avisos de uma tela valem só para a sessão em que ela abriu: o que responde
 * depois de "Trocar usuário" ou "Sair" não mostra nada à pessoa seguinte (D12).
 */
export function useToast(): ToastContextValue {
  const { show, dismiss, setBottomOffset, currentSession } = useToastInternals()
  const [session] = useState(currentSession)
  return useMemo(
    () => ({ show: (options: ToastOptions) => show(options, session), dismiss, setBottomOffset }),
    [show, dismiss, setBottomOffset, session],
  )
}

/** Fim de sessão: fecha todos os avisos e descarta os que ainda chegariam. */
export function useEndToastSession(): () => void {
  return useToastInternals().endSession
}
