import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import type { Movement } from '@/lib/api'
import { Button } from '@/components/ui/Button'

function remaining(until: string | null): number | null {
  if (until === null) return null
  return Math.max(0, Math.floor((new Date(until).getTime() - Date.now()) / 1000))
}

/** "Desfazer" com a contagem regressiva da janela de 10 min da RN-11 (R7). Admin: sem prazo. */
export function UndoButton({
  movement,
  onUndo,
  loading,
  size = 'md',
}: {
  movement: Movement
  onUndo: () => void
  loading?: boolean
  size?: 'md' | 'lg'
}) {
  const undo = movement.undo
  const [seconds, setSeconds] = useState(() => remaining(undo?.until ?? null))

  useEffect(() => {
    setSeconds(remaining(undo?.until ?? null))
    if (!undo?.until) return
    const timer = window.setInterval(() => setSeconds(remaining(undo.until)), 1000)
    return () => window.clearInterval(timer)
  }, [undo?.until])

  if (!undo || seconds === 0) return null
  const what = undo.action === 'checkout' ? 'baixa' : 'liberação'
  const clock = seconds === null ? '' : ` (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')})`

  return (
    <Button variant="secondary" size={size} onClick={onUndo} loading={loading} icon={<Undo2 aria-hidden="true" className="size-4" />}>
      Desfazer {what}
      {clock}
    </Button>
  )
}
