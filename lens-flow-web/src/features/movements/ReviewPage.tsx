import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  ArrowLeftRight,
  Check,
  CheckSquare,
  ChevronRight,
  ListChecks,
  PackageCheck,
  Search,
  Square,
  X,
} from 'lucide-react'
import type { BatchAction, BoxCategory, BoxColor, DelayLevel, Movement } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDayMonth, formatTime, plural, relativeDayLabel } from '@/lib/format'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { ErrorState } from '@/components/ui/QueryState'
import { ListSkeleton } from '@/components/ui/Skeleton'
import { useToastBottomOffset } from '@/components/ui/Toast'
import { BoxChip } from '@/features/boxes/BoxChip'
import { BOX_CATEGORIES, BOX_COLOR_ORDER, BOX_COLORS } from '@/features/boxes/boxColors'
import { fetchMovements, fetchSummary, movementKeys, type MovementListParams } from './api'
import { ChangeBoxDialog } from './ChangeBoxDialog'
import { DelayBadge } from './MovementBadges'
import { DELAY_LEVELS, movementStage } from './movementLabels'
import { useMovementActions, type BatchFailure } from './useMovementActions'

type Tab = 'pendentes' | 'liberar'
type SortKey = 'priority' | 'box' | 'oldest'

const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'priority', label: 'Prioridade' },
  { key: 'box', label: 'Número da caixa' },
  { key: 'oldest', label: 'Mais antigos' },
]

const MAX_BATCH = 100
const MAX_PAGES = 10

function listParams(tab: Tab, sort: SortKey): MovementListParams {
  return tab === 'pendentes'
    ? { status: 'open', sort, limit: 100 }
    : { status: 'out', boxReleased: false, sort: sort === 'priority' ? 'oldest' : sort, limit: 100 }
}

/** Grupos por folha, da mais antiga para a mais nova; dentro, a ordem do servidor. */
function groupBySheet(items: Movement[]): Array<{ date: string; items: Movement[] }> {
  const groups = new Map<string, Movement[]>()
  for (const item of items) {
    const list = groups.get(item.sheetDate)
    if (list) list.push(item)
    else groups.set(item.sheetDate, [item])
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, list]) => ({ date, items: list }))
}

function matchesFilter(movement: Movement, filter: string, level: DelayLevel | null, number: string): boolean {
  if (filter.startsWith('cat:') && movement.box.category !== filter.slice(4)) return false
  if (filter.startsWith('cor:') && movement.box.color !== filter.slice(4)) return false
  if (level && movement.delayLevel !== level) return false
  if (number && !movement.box.number.startsWith(number)) return false
  return true
}

/** Conferência (seção 6, item 4): pendentes por folha, baixa e liberação em um toque ou em lote. */
export function ReviewPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('aba') === 'liberar' ? 'liberar' : 'pendentes'
  const sort = (SORTS.find((item) => item.key === params.get('ordem'))?.key ?? 'priority') as SortKey
  const filter = params.get('filtro') ?? ''
  const levelParam = params.get('nivel')
  const level = levelParam && levelParam in DELAY_LEVELS ? (levelParam as DelayLevel) : null
  const [number, setNumber] = useState('')
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [failures, setFailures] = useState<BatchFailure[]>([])
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState<Movement | null>(null)
  const { act, undoOne } = useMovementActions()
  useToastBottomOffset(selecting ? 136 : 0)

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }

  const summary = useQuery({ queryKey: movementKeys.summary(), queryFn: fetchSummary })
  const query = useInfiniteQuery({
    queryKey: movementKeys.list(listParams(tab, sort)),
    queryFn: ({ pageParam, signal }) => fetchMovements({ ...listParams(tab, sort), cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last, pages) => (pages.length < MAX_PAGES ? (last.nextCursor ?? undefined) : undefined),
  })

  // A Conferência mostra todos os pendentes: carrega as páginas seguintes sozinha.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const serverDate = query.data?.pages[0]?.serverDate ?? summary.data?.serverDate
  const all = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data])
  // "Saiu e liberar" tira o serviço da lista na hora; "Saiu" o mantém, com o check marcado.
  const live = useMemo(
    () => all.filter((item) => (tab === 'pendentes' ? movementStage(item) !== 'released' : movementStage(item) === 'out')),
    [all, tab],
  )
  const visible = useMemo(() => live.filter((item) => matchesFilter(item, filter, level, number)), [live, filter, level, number])
  const groups = useMemo(() => (sort === 'box' ? null : groupBySheet(visible)), [sort, visible])
  const selectedItems = live.filter((item) => selected.has(item.id))

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BATCH) next.add(id)
      return next
    })
  }

  function exitSelection() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function runBulk(action: BatchAction) {
    if (busy || selectedItems.length === 0) return
    setBusy(true)
    setFailures([])
    const outcome = await act(selectedItems, action)
    setBusy(false)
    setFailures(outcome.failures)
    // Os que falharam continuam selecionados para tentar de novo (R6).
    if (outcome.failures.length) setSelected(new Set(outcome.failures.map((failure) => failure.movement.id)))
    else exitSelection()
  }

  const counts = summary.data?.counts
  const allVisibleSelected = visible.length > 0 && visible.every((item) => selected.has(item.id))

  const renderRow = (movement: Movement) => (
    <ReviewRow
      key={movement.id}
      movement={movement}
      showSheetDate={sort === 'box'}
      selecting={selecting}
      selected={selected.has(movement.id)}
      onToggle={() => toggle(movement.id)}
      onAct={(action) => void act([movement], action)}
      onUndoCheckout={() => void undoOne(movement, 'checkout')}
      onChangeBox={() => setChanging(movement)}
    />
  )

  return (
    <section>
      <PageHeader
        title="Conferência"
        description={
          counts
            ? `${plural(counts.open, 'pendente')} · ${plural(counts.late, 'atrasado')} · ${plural(counts.attention, 'em atenção', 'em atenção')}`
            : undefined
        }
        actions={
          selecting ? (
            <Button variant="secondary" onClick={exitSelection} icon={<X aria-hidden="true" className="size-4" />}>
              Cancelar seleção
            </Button>
          ) : (
            <Button
              variant="secondary"
              onClick={() => {
                setSelecting(true)
                setFailures([])
              }}
              icon={<ListChecks aria-hidden="true" className="size-4" />}
            >
              Selecionar
            </Button>
          )
        }
      />

      <div role="tablist" aria-label="O que conferir" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1">
        {(
          [
            ['pendentes', 'Pendentes', counts?.open],
            ['liberar', 'Falta liberar', counts?.outNotReleased],
          ] as const
        ).map(([key, text, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => {
              exitSelection()
              setFailures([])
              setParam('aba', key === 'liberar' ? 'liberar' : null)
            }}
            className={cn(
              'focus-ring min-h-touch rounded-lg px-2 text-sm font-semibold',
              tab === key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted',
            )}
          >
            {text}
            {count !== undefined && ` (${count})`}
          </button>
        ))}
      </div>

      <Filters
        sort={sort}
        filter={filter}
        level={level}
        number={number}
        onSort={(value) => setParam('ordem', value === 'priority' ? null : value)}
        onFilter={(value) => setParam('filtro', value || null)}
        onClearLevel={() => setParam('nivel', null)}
        onNumber={setNumber}
      />

      {failures.length > 0 && (
        <Alert
          tone="error"
          className="mb-3"
          title={`${plural(failures.length, 'serviço não foi alterado', 'serviços não foram alterados')}`}
          action={
            <button
              type="button"
              onClick={() => setFailures([])}
              aria-label="Fechar resultado do lote"
              className="focus-ring flex size-touch items-center justify-center rounded-xl"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          }
        >
          <ul className="mt-1 flex flex-col gap-1">
            {failures.map(({ movement, message }) => (
              <li key={movement.id}>
                <strong>
                  Caixa {movement.box.number} · {movement.clientName}:
                </strong>{' '}
                {message}
              </li>
            ))}
          </ul>
          {selecting && <p className="mt-1">Eles continuam selecionados para você tentar de novo.</p>}
        </Alert>
      )}

      {query.isPending ? (
        <ListSkeleton rows={5} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title={live.length === 0 ? (tab === 'pendentes' ? 'Nenhum serviço pendente' : 'Nenhuma caixa para liberar') : 'Nada com esse filtro'}
          description={live.length === 0 ? 'Tudo conferido.' : 'Mude ou limpe os filtros para ver os outros.'}
        />
      ) : groups ? (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <section key={group.date} aria-label={`Folha de ${formatDayMonth(group.date)}`}>
              <h2 className="mb-2 flex items-baseline gap-2 text-base font-bold text-ink">
                <Link to={`/folhas/${group.date}`} className="focus-ring hover:underline">
                  {relativeDayLabel(group.date, serverDate)} · {formatDayMonth(group.date)}
                </Link>
                <span className="text-sm font-medium text-ink-muted">{plural(group.items.length, 'serviço')}</span>
              </h2>
              <ul className="flex flex-col gap-2">{group.items.map(renderRow)}</ul>
            </section>
          ))}
        </div>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Pela prateleira">
          {visible.map(renderRow)}
        </ul>
      )}

      {query.isFetchingNextPage && <p className="mt-3 text-center text-sm text-ink-muted">Carregando mais…</p>}

      {selecting && (
        <>
          <div aria-hidden="true" className="h-36" />
          <div className="fixed inset-x-0 bottom-[calc(var(--spacing-bottom-nav)+env(safe-area-inset-bottom))] z-30 border-t border-line bg-surface px-4 py-2 shadow-[0_-4px_12px_rgba(16,24,40,0.08)] md:bottom-0 md:left-64">
            <div className="mx-auto flex max-w-5xl flex-col gap-2">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-ink" aria-live="polite">
                  {selected.size} de {visible.length} visíveis
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelected(allVisibleSelected ? new Set() : new Set(visible.slice(0, MAX_BATCH).map((item) => item.id)))
                  }
                  className="focus-ring min-h-touch rounded-xl px-2 font-semibold text-primary"
                >
                  {allVisibleSelected ? 'Limpar seleção' : 'Selecionar visíveis'}
                </button>
              </div>
              {tab === 'pendentes' ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="secondary" size="lg" disabled={selected.size === 0} loading={busy} onClick={() => void runBulk('checkout')}>
                    Dar baixa ({selected.size})
                  </Button>
                  <Button size="lg" disabled={selected.size === 0} loading={busy} onClick={() => void runBulk('checkout-and-release')}>
                    Dar baixa e liberar ({selected.size})
                  </Button>
                </div>
              ) : (
                <Button size="lg" fullWidth disabled={selected.size === 0} loading={busy} onClick={() => void runBulk('release-box')}>
                  Liberar caixas ({selected.size})
                </Button>
              )}
              {selected.size >= MAX_BATCH && <p className="text-xs text-ink-muted">No máximo {MAX_BATCH} por vez.</p>}
            </div>
          </div>
        </>
      )}

      <ChangeBoxDialog movement={changing} onClose={() => setChanging(null)} />
    </section>
  )
}

function Filters({
  sort,
  filter,
  level,
  number,
  onSort,
  onFilter,
  onClearLevel,
  onNumber,
}: {
  sort: SortKey
  filter: string
  level: DelayLevel | null
  number: string
  onSort: (value: SortKey) => void
  onFilter: (value: string) => void
  onClearLevel: () => void
  onNumber: (value: string) => void
}) {
  const chip = (active: boolean) =>
    cn(
      'focus-ring inline-flex min-h-touch items-center gap-1.5 rounded-full border px-3 text-sm font-semibold',
      active ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong bg-surface text-ink',
    )

  return (
    <div className="mb-4 flex flex-col gap-2">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Buscar pelo número da caixa</span>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-ink-muted" />
          <input
            value={number}
            onChange={(event) => onNumber(event.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Nº da caixa"
            autoComplete="off"
            className="focus-ring min-h-touch w-full rounded-xl border border-line-strong bg-surface pl-10 pr-3 text-base"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="min-w-0">
          <span className="sr-only">Filtrar por categoria ou cor</span>
          <select
            value={filter}
            onChange={(event) => onFilter(event.target.value)}
            className="focus-ring min-h-touch w-full rounded-xl border border-line-strong bg-surface px-2 text-base"
          >
            <option value="">Todas as caixas</option>
            <optgroup label="Categoria">
              {(Object.keys(BOX_CATEGORIES) as BoxCategory[]).map((key) => (
                <option key={key} value={`cat:${key}`}>
                  {BOX_CATEGORIES[key].label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Cor">
              {BOX_COLOR_ORDER.map((color: BoxColor) => (
                <option key={color} value={`cor:${color}`}>
                  {BOX_COLORS[color].label} ({BOX_CATEGORIES[BOX_COLORS[color].category].label})
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">Ordenar por</span>
          <select
            value={sort}
            onChange={(event) => onSort(event.target.value as SortKey)}
            className="focus-ring min-h-touch w-full rounded-xl border border-line-strong bg-surface px-2 text-base"
          >
            {SORTS.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {level && (
        <div>
          <button type="button" className={chip(true)} onClick={onClearLevel} aria-label={`Tirar o filtro ${DELAY_LEVELS[level].label}`}>
            Só “{DELAY_LEVELS[level].label}”
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function ReviewRow({
  movement,
  showSheetDate,
  selecting,
  selected,
  onToggle,
  onAct,
  onUndoCheckout,
  onChangeBox,
}: {
  movement: Movement
  showSheetDate: boolean
  selecting: boolean
  selected: boolean
  onToggle: () => void
  onAct: (action: BatchAction) => void
  onUndoCheckout: () => void
  onChangeBox: () => void
}) {
  const stage = movementStage(movement)
  const isOut = stage !== 'open'
  const canUndoCheckout = isOut && movement.undo?.action === 'checkout'
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <BoxChip number={movement.box.number} color={movement.box.color} className="mb-1.5" />
        <p className="truncate font-semibold text-ink">{movement.clientName}</p>
        <p className="truncate text-sm text-ink-muted">
          {movement.orderService ? `OS ${movement.orderService}` : 'Sem OS'}
          {movement.note ? ` · ${movement.note}` : ''}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
          {movement.delayLevel && <DelayBadge level={movement.delayLevel} />}
          {movement.daysOpen !== null && (
            <span>{movement.daysOpen === 0 ? 'aberto hoje' : `${plural(movement.daysOpen, 'dia')} em aberto`}</span>
          )}
          {isOut && movement.outAt && (
            <span>
              Saiu às {formatTime(movement.outAt)}
              {movement.outBy ? ` por ${movement.outBy.name}` : ''}
            </span>
          )}
          {showSheetDate && <span>folha de {formatDayMonth(movement.sheetDate)}</span>}
        </p>
      </div>
    </>
  )

  if (selecting) {
    return (
      <li>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Selecionar caixa ${movement.box.number}, ${movement.clientName}`}
          onClick={onToggle}
          className={cn(
            'focus-ring flex w-full items-center gap-3 rounded-2xl border bg-surface p-3 text-left',
            selected ? 'border-primary ring-2 ring-primary' : 'border-line',
          )}
        >
          {selected ? (
            <CheckSquare aria-hidden="true" className="size-6 shrink-0 text-primary" />
          ) : (
            <Square aria-hidden="true" className="size-6 shrink-0 text-ink-muted" />
          )}
          {body}
        </button>
      </li>
    )
  }

  const checkClass = (checked: boolean) =>
    cn(
      'focus-ring flex min-h-touch-lg flex-col items-center justify-center rounded-xl border px-2 text-sm font-semibold leading-tight disabled:cursor-not-allowed',
      checked ? 'border-success bg-success-soft text-success' : 'border-line-strong bg-surface text-ink disabled:text-ink-muted',
    )

  return (
    <li className="rounded-2xl border border-line bg-surface">
      <div className="flex items-start">
        <Link
          to={`/servicos/${movement.id}`}
          aria-label={`${movement.clientName}, caixa ${movement.box.number}: ver detalhe`}
          className="focus-ring flex min-w-0 flex-1 items-center gap-3 rounded-tl-2xl p-3 hover:bg-surface-muted"
        >
          {body}
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 self-center text-ink-muted" />
        </Link>
        {movement.canChangeBox && (
          <button
            type="button"
            onClick={onChangeBox}
            aria-label={`Trocar caixa de ${movement.clientName}`}
            title="Trocar caixa"
            className="focus-ring m-1 flex size-touch shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <ArrowLeftRight aria-hidden="true" className="size-5" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-[auto_auto_1fr] gap-2 border-t border-line p-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={isOut}
          aria-label="Saiu"
          disabled={isOut && !canUndoCheckout}
          onClick={() => (isOut ? onUndoCheckout() : onAct('checkout'))}
          className={checkClass(isOut)}
        >
          <span className="flex items-center gap-1">
            {isOut ? <Check aria-hidden="true" className="size-4" /> : <Square aria-hidden="true" className="size-4" />}
            Saiu
          </span>
        </button>
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label="Liberar caixa"
          aria-describedby={isOut ? undefined : `release-hint-${movement.id}`}
          disabled={!isOut}
          onClick={() => onAct('release-box')}
          className={checkClass(false)}
        >
          <span className="flex items-center gap-1">
            <Square aria-hidden="true" className="size-4" />
            Liberar caixa
          </span>
          {!isOut && (
            <span id={`release-hint-${movement.id}`} className="text-xs font-normal">
              dê baixa antes
            </span>
          )}
        </button>
        {isOut ? (
          <Button size="lg" className="px-3 text-base" onClick={() => onAct('release-box')} icon={<PackageCheck aria-hidden="true" className="size-5" />}>
            Liberar
          </Button>
        ) : (
          <Button size="lg" className="px-3 text-base" onClick={() => onAct('checkout-and-release')}>
            Saiu e liberar
          </Button>
        )}
      </div>
    </li>
  )
}
