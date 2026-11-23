/**
 * Rascunhos de formulário (R17): ficam no sessionStorage do aparelho, por
 * usuário, para sobreviver à sessão expirada e voltar depois do novo login.
 */
const PREFIX = 'lf:draft:'

export function draftStorageKey(userId: string, key: string): string {
  return `${PREFIX}${userId}:${key}`
}

export function readDraft<T>(storageKey: string): T | undefined {
  try {
    const raw = sessionStorage.getItem(storageKey)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch {
    return undefined
  }
}

export function writeDraft(storageKey: string, value: unknown): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(value))
  } catch {
    // Sem armazenamento: o rascunho fica só na memória.
  }
}

export function removeDraft(storageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // Idem.
  }
}

/** Apaga os rascunhos de um usuário ("Sair" de propósito). */
export function clearDraftsOf(userId: string): void {
  try {
    const prefix = `${PREFIX}${userId}:`
    const keys: string[] = []
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // Idem.
  }
}
