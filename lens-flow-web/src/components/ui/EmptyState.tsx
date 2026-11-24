import type { ReactNode } from 'react'
import { Inbox, type LucideIcon } from 'lucide-react'

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  action,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <Icon aria-hidden="true" className="size-10 text-ink-muted" />
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-ink">{title}</p>
        {description && <p className="text-base text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
