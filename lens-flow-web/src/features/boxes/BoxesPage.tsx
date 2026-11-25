import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Ban, Boxes as BoxesIcon, Circle, Package, PackageCheck, Plus, Search } from 'lucide-react'
import type { Box, BoxColor } from '@/lib/api'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { boxKeys, fetchBoxes } from './api'
import { BoxBatchDialog } from './BoxBatchDialog'
import { BoxChip } from './BoxChip'
import { BOX_COLOR_ORDER, BOX_COLORS } from './boxColors'
import { EditBoxDialog } from './EditBoxDialog'

type StateFilter = '' | 'livres' | 'ocupadas' | 'desativadas'

const STATE_FILTERS: Array<{ key: StateFilter; label: string }> = [
  { key: '', label: 'Todas' },
  { key: 'livres', label: 'Livres' },
  { key: 'ocupadas', label: 'Ocupadas' },
  { key: 'desativadas', label: 'Desativadas' },
]

type TileState = 'free' | 'occupied' | 'out' | 'inactive'

function tileState(box: Box): TileState {
  if (!box.active) return 'inactive'
  if (box.state === 'free') return 'free'
  return box.currentMovement?.status === 'out' ? 'out' : 'occupied'
}

const TILE: Record<TileState, { label: string; Icon: typeof Circle; className: string }> = {
  free: { label: 'Livre', Icon: Circle, className: 'border-line bg-surface text-ink' },
  occupied: { label: 'Ocupada', Icon: Package, className: 'border-status-open/40 bg-status-open-soft text-status-open' },
  out: { label: 'Falta liberar', Icon: PackageCheck, className: 'border-status-out/40 bg-status-out-soft text-status-out' },
  inactive: { label: 'Desativada', Icon: Ban, className: 'border-dashed border-line-strong bg-canvas text-ink-muted' },
}

function matches(box: Box, state: StateFilter, number: string): boolean {
  if (number && !box.number.startsWith(number)) return false
  if (state === 'livres') return box.active && box.state === 'free'
  if (state === 'ocupadas') return box.active && box.state === 'occupied'
  if (state === 'desativadas') return !box.active
  return true
}

/** Caixas (admin, seção 6 item 9): grade por cor com o estado, cadastro em lote, edição e desativação. */
export function BoxesPage() {
  const [params, setParams] = useSearchParams()
  const stateParam = params.get('estado') ?? ''
  const state = (STATE_FILTERS.some((item) => item.key === stateParam) ? stateParam : '') as StateFilter
  const [number, setNumber] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [editing, setEditing] = useState<Box | null>(null)

  const query = useQuery({ queryKey: boxKeys.list(), queryFn: ({ signal }) => fetchBoxes(signal), staleTime: 5_000 })
  const boxes = useMemo(() => query.data ?? [], [query.data])

  const groups = useMemo(() => {
    const byColor = new Map<BoxColor, Box[]>()
    for (const box of boxes) {
      if (!matches(box, state, number)) continue
      const list = byColor.get(box.color)
      if (list) list.push(box)
      else byColor.set(box.color, [box])
    }
    return BOX_COLOR_ORDER.filter((color) => byColor.has(color)).map((color) => ({ color, boxes: byColor.get(color) ?? [] }))
  }, [boxes, state, number])

  const active = boxes.filter((box) => box.active)
  const occupied = active.filter((box) => box.state === 'occupied').length

  function setState(value: StateFilter) {
    const next = new URLSearchParams(params)
    if (value) next.set('estado', value)
    else next.delete('estado')
    setParams(next, { replace: true })
  }

  const addButton = (
    <Button onClick={() => setBatchOpen(true)} icon={<Plus aria-hidden="true" className="size-5" />}>
      Cadastrar caixas
    </Button>
  )

  return (
    <section>
      <PageHeader
        title="Caixas"
        description={
          query.data
            ? `${plural(active.length, 'ativa')} · ${plural(active.length - occupied, 'livre')} · ${plural(occupied, 'ocupada')}`
            : 'Todas as caixas por cor, com o estado de cada uma.'
        }
        actions={addButton}
      />

      <div className="mb-4 flex flex-col gap-2">
        <label className="relative">
          <span className="sr-only">Buscar pelo número da caixa</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            value={number}
            onChange={(event) => setNumber(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Nº da caixa"
            autoComplete="off"
            maxLength={6}
            className="focus-ring min-h-touch w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-base"
          />
        </label>
        {/* No celular a largura de cada opção segue o texto e a linha quebra se faltar espaço: a fonte muda de um aparelho para outro. */}
        <div role="group" aria-label="Estado" className="flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1 sm:grid sm:grid-cols-4">
          {STATE_FILTERS.map((item) => (
            <button
              key={item.key || 'todas'}
              type="button"
              aria-pressed={state === item.key}
              onClick={() => setState(item.key)}
              className={cn(
                'focus-ring min-h-touch flex-auto rounded-lg px-1 text-sm font-semibold',
                state === item.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <ListSkeleton rows={4} label="Carregando caixas…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : boxes.length === 0 ? (
        <EmptyState
          icon={BoxesIcon}
          title="Nenhuma caixa cadastrada"
          description="Cadastre as caixas de uma cor de uma vez, por exemplo 1-40."
          action={addButton}
        />
      ) : groups.length === 0 ? (
        <EmptyState title="Nenhuma caixa com esse filtro" description="Mude o número ou o estado para ver as outras." />
      ) : (
        <div className="flex flex-col gap-5">
          <p className="text-sm text-ink-muted">Toque numa caixa ocupada para abrir o serviço; nas outras, para editar ou desativar.</p>
          {groups.map((group) => (
            <section key={group.color} aria-label={`Caixas ${BOX_COLORS[group.color].label}`}>
              <h2 className="mb-2 flex flex-wrap items-center gap-2">
                <BoxChip color={group.color} size="md" />
                <span className="text-sm font-medium text-ink-muted">{plural(group.boxes.length, 'caixa')}</span>
              </h2>
              <ul className="grid grid-cols-2 gap-2 min-[340px]:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
                {group.boxes.map((box) => (
                  <li key={box.id}>
                    <BoxTile box={box} onEdit={() => setEditing(box)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <BoxBatchDialog open={batchOpen} onClose={() => setBatchOpen(false)} existing={boxes} />
      <EditBoxDialog box={editing} onClose={() => setEditing(null)} />
    </section>
  )
}

function BoxTile({ box, onEdit }: { box: Box; onEdit: () => void }) {
  const state = tileState(box)
  const { label, Icon, className } = TILE[state]
  const current = box.currentMovement
  const tileClass = cn(
    'focus-ring flex min-h-touch-lg w-full flex-col items-start gap-0.5 rounded-xl border p-2 text-left hover:brightness-95',
    className,
  )
  const content = (
    <>
      <span className="flex w-full items-center gap-1.5">
        <span aria-hidden="true" className={cn('size-3 shrink-0 rounded-sm border border-box-swatch-border/60', BOX_COLORS[box.color].swatchClass)} />
        <span className={cn('min-w-0 font-mono text-xl font-bold tabular-nums wrap-anywhere', state === 'inactive' && 'line-through')}>{box.number}</span>
      </span>
      <span className="flex max-w-full flex-wrap items-center gap-x-1 text-xs font-semibold">
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
        {label}
      </span>
      {current && state !== 'inactive' && <span className="w-full truncate text-xs text-ink-muted">{current.clientName}</span>}
    </>
  )

  // A ocupada leva ao serviço (seção 6 item 9).
  if (current && state !== 'inactive') {
    return (
      <Link
        to={`/servicos/${current.id}`}
        aria-label={`Caixa ${box.number}, ${label.toLowerCase()}: ${current.clientName}. Abrir o serviço`}
        className={tileClass}
      >
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onEdit} aria-label={`Caixa ${box.number}, ${label.toLowerCase()}. Editar`} className={tileClass}>
      {content}
    </button>
  )
}
