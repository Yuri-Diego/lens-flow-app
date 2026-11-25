import type { ReactNode } from 'react'
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'

type Tone = 'error' | 'warning' | 'info' | 'success'

const TONES: Record<Tone, { className: string; Icon: LucideIcon }> = {
  error: { className: 'border-danger/40 bg-danger-soft text-danger', Icon: CircleAlert },
  warning: { className: 'border-warning/40 bg-warning-soft text-warning', Icon: TriangleAlert },
  info: { className: 'border-info/40 bg-info-soft text-info', Icon: Info },
  success: { className: 'border-success/40 bg-success-soft text-success', Icon: CircleCheck },
}

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone
  title?: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  const { className: toneClass, Icon } = TONES[tone]
  return (
    <div
      role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-xl border p-3 text-sm', toneClass, className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 wrap-break-word">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
      </div>
      {action}
    </div>
  )
}
