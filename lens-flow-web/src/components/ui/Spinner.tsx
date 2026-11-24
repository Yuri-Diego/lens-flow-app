import { LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/cn'

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <>
      <LoaderCircle aria-hidden="true" className={cn('size-5 animate-spin', className)} />
      {label && <span className="sr-only">{label}</span>}
    </>
  )
}
