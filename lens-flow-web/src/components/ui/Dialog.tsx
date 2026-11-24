import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Painel modal. No celular sobe da base (perto do polegar); no computador fica
 * no centro. Esc e o fundo fecham; o foco volta para quem abriu.
 */
export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    // Foco no primeiro campo, ou no próprio painel.
    const first = panel?.querySelector<HTMLElement>('[data-autofocus], input, select, textarea')
    ;(first ?? panel)?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-2xl bg-surface pb-safe shadow-xl outline-none md:rounded-2xl md:pb-0"
      >
        <div className="flex items-center gap-2 border-b border-line py-2 pl-4 pr-2">
          <h2 id={titleId} className="flex-1 text-lg font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="focus-ring flex size-touch items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line p-3">{footer}</div>}
      </div>
    </div>
  )
}
