import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { useAuth } from '@/lib/auth/AuthProvider'
import { draftStorageKey, readDraft, removeDraft, writeDraft } from './drafts'

/**
 * Estado de formulário que sobrevive à sessão expirada (R17). Use como um
 * `useState`; chame `clear()` depois de salvar com sucesso.
 */
export function useDraft<T>(key: string, initialValue: T): [T, Dispatch<SetStateAction<T>>, () => void] {
  const { user, lastUserId } = useAuth()
  const userId = user?.id ?? lastUserId
  const storageKey = userId ? draftStorageKey(userId, key) : null

  const [value, setValue] = useState<T>(() => {
    if (!storageKey) return initialValue
    return readDraft<T>(storageKey) ?? initialValue
  })

  useEffect(() => {
    if (storageKey) writeDraft(storageKey, value)
  }, [storageKey, value])

  const clear = useCallback(() => {
    if (storageKey) removeDraft(storageKey)
    setValue(initialValue)
    // initialValue entra só na limpeza; não precisa recriar a função a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  return [value, setValue, clear]
}
