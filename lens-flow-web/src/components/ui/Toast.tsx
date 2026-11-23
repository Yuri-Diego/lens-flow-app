import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type ToastTone = 'info' | 'success' | 'error'

export interface ToastOptions {
  message: string
  tone?: ToastTone
  /** Ação do aviso, como "Desfazer". */
  action?: { label: string; onClick: () => void }
  /** Em milissegundos. Padrão: 5 s; com ação, 10 s (R7). */
  duration?: number
}

interface ToastItem extends ToastOptions {
  id: number
}

interface ToastContextValue {
  show: (options: ToastOptions) => number
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

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
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((options: ToastOptions) => {
    const id = nextId.current++
    setToasts((current) => [...current, { ...options, id }].slice(-MAX_VISIBLE))
    return id
  }, [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Avisos"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom)+0.75rem)] z-50 flex flex-col items-center gap-2 px-4 md:bottom-6 md:items-end md:px-6"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </section>
    </ToastContext.Provider>
  )
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false)
  const duration = toast.duration ?? (toast.action ? ACTION_DURATION : DEFAULT_DURATION)
  const { className, Icon } = TONES[toast.tone ?? 'info']

  // Some sozinho, mas espera enquanto a pessoa está com o dedo, o mouse ou o foco nele.
  useEffect(() => {
    if (paused) return
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
      <p className="flex-1 py-2 text-base">{toast.message}</p>
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

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return context
}
