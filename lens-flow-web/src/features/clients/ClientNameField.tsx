import { useId, useState, type KeyboardEvent } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/cn'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { TextField, type TextFieldProps } from '@/components/ui/TextField'
import { clientKeys, fetchClientSuggestions } from './api'

/** Espera entre teclas antes de buscar (D24). */
const SUGGESTION_DEBOUNCE_MS = 200

/** Sem acento e sem maiúsculas, como o servidor compara. */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
}

export interface ClientNameFieldProps extends Omit<TextFieldProps, 'value' | 'onChange' | 'role' | 'trailing'> {
  value: string
  onValueChange: (value: string) => void
  /** A pessoa escolheu uma sugestão: o campo já tem o nome; leve ao próximo campo. */
  onPick?: (name: string) => void
}

/**
 * Campo Cliente com os nomes de ótica já usados (D24, R12). É um combobox com
 * lista (`aria-autocomplete="list"`): setas e Enter escolhem, Esc fecha e um
 * toque escolhe. O texto livre continua valendo: sem sugestão escolhida, o
 * Enter segue para o próximo campo como antes. A busca nunca segura o envio.
 */
export function ClientNameField({
  value,
  onValueChange,
  onPick,
  onKeyDown,
  onFocus,
  onBlur,
  ...props
}: ClientNameFieldProps) {
  const listId = useId()
  const [focused, setFocused] = useState(false)
  // Escolheu ou apertou Esc: a lista só volta quando a pessoa digitar de novo.
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(-1)

  const term = value.trim()
  const debounced = useDebouncedValue(term, SUGGESTION_DEBOUNCE_MS)
  const query = useQuery({
    queryKey: clientKeys.suggestions(debounced),
    // A troca de chave cancela a busca anterior (o `signal` vai para o axios).
    queryFn: ({ signal }) => fetchClientSuggestions(debounced, signal),
    enabled: focused && !dismissed && debounced.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  })

  // Enquanto a resposta for de um texto anterior, mostra só o que ainda combina
  // com o começo do nome ou de uma palavra dele; a resposta nova manda.
  const folded = fold(term)
  const fresh = !query.isPlaceholderData && debounced === term
  const stillMatches = (name: string) => {
    const candidate = fold(name)
    return candidate.startsWith(folded) || candidate.includes(` ${folded}`)
  }
  const items = term
    ? (query.data ?? []).filter((item) => item.name !== value && (fresh || stillMatches(item.name)))
    : []
  const open = focused && !dismissed && items.length > 0
  const activeIndex = open && active < items.length ? active : -1
  const optionId = (index: number) => `${listId}-option-${index}`

  function pick(name: string) {
    onValueChange(name)
    setDismissed(true)
    setActive(-1)
    onPick?.(name)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!event.nativeEvent.isComposing) {
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length > 0) {
        event.preventDefault()
        const count = items.length
        setDismissed(false)
        setActive(
          event.key === 'ArrowDown'
            ? (activeIndex + 1) % count
            : activeIndex <= 0
              ? count - 1
              : activeIndex - 1,
        )
        return
      }
      if (event.key === 'Enter' && activeIndex >= 0) {
        event.preventDefault()
        pick(items[activeIndex].name)
        return
      }
      if (event.key === 'Escape' && open) {
        // Fecha só a lista, sem fechar um painel em volta.
        event.preventDefault()
        event.stopPropagation()
        setDismissed(true)
        setActive(-1)
        return
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div className="relative">
      <TextField
        {...props}
        value={value}
        onChange={(event) => {
          onValueChange(event.target.value)
          setDismissed(false)
          setActive(-1)
        }}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          setFocused(true)
          onFocus?.(event)
        }}
        onBlur={(event) => {
          setFocused(false)
          setActive(-1)
          onBlur?.(event)
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Clientes já usados"
          // Tocar na lista não tira o foco do campo antes do clique.
          onMouseDown={(event) => event.preventDefault()}
          onPointerDown={(event) => event.preventDefault()}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line-strong bg-surface py-1 shadow-lg"
        >
          {items.map((item, index) => (
            <li
              key={item.name}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              onClick={() => pick(item.name)}
              className={cn(
                'flex min-h-touch cursor-pointer items-center px-3 text-base text-ink',
                index === activeIndex ? 'bg-primary-soft text-primary' : 'hover:bg-surface-muted',
              )}
            >
              <span className="truncate">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only" aria-live="polite">
        {open ? `${items.length === 1 ? '1 sugestão' : `${items.length} sugestões`}. Use as setas para escolher.` : ''}
      </span>
    </div>
  )
}
