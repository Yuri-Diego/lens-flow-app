import { useCallback, useMemo, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { draftStorageKey, parseDraft, readDraft, readDraftText, removeDraft, subscribeDrafts, writeDraft } from './drafts'

/**
 * Estado de formulário que sobrevive à sessão expirada (R17). Use como um
 * `useState`; chame `clear()` depois de salvar com sucesso. O valor é o do
 * rascunho guardado: escrever funciona mesmo depois de sair da tela.
 */
export function useDraft<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { user, lastUserId } = useAuth()
  const storageKey = draftStorageKey(user?.id ?? lastUserId ?? '', key)
  const [initial] = useState(initialValue)

  const text = useSyncExternalStore(subscribeDrafts, () => readDraftText(storageKey))
  const value = useMemo(() => parseDraft(text, initial), [text, initial])

  const setValue = useCallback(
    (next: SetStateAction<T>) => {
      const resolved = typeof next === 'function' ? (next as (current: T) => T)(readDraft(storageKey, initial)) : next
      writeDraft(storageKey, resolved)
    },
    [storageKey, initial],
  )
  const clear = useCallback(() => removeDraft(storageKey), [storageKey])

  return [value, setValue, clear]
}
