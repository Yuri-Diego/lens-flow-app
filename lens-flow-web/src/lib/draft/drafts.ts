/**
 * Rascunhos de formulário (R17): ficam no sessionStorage do aparelho, por
 * usuário, para sobreviver à sessão expirada e voltar depois do novo login.
 * Quem escreve pode já ter saído da tela: as telas abertas são avisadas.
 */
const PREFIX = 'lf:draft:'

/** Só o que o sessionStorage recusou (cheio ou bloqueado). */
const memory = new Map<string, string>()
const listeners = new Set<() => void>()

function notify(): void {
  listeners.forEach((listener) => listener())
}

export function subscribeDrafts(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function draftStorageKey(userId: string, key: string): string {
  return `${PREFIX}${userId}:${key}`
}

/** O texto guardado: muda de valor só quando o rascunho muda. */
export function readDraftText(storageKey: string): string | null {
  const kept = memory.get(storageKey)
  if (kept !== undefined) return kept
  try {
    return sessionStorage.getItem(storageKey)
  } catch {
    return null
  }
}

export function parseDraft<T>(text: string | null, initialValue: T): T {
  if (text === null) return initialValue
  try {
    return JSON.parse(text) as T
  } catch {
    return initialValue
  }
}

export function readDraft<T>(storageKey: string, initialValue: T): T {
  return parseDraft(readDraftText(storageKey), initialValue)
}

export function writeDraft(storageKey: string, value: unknown): void {
  const text = JSON.stringify(value)
  try {
    sessionStorage.setItem(storageKey, text)
    memory.delete(storageKey)
  } catch {
    // Sem armazenamento: o rascunho fica só na memória.
    memory.set(storageKey, text)
  }
  notify()
}

function remove(storageKey: string): void {
  memory.delete(storageKey)
  try {
    sessionStorage.removeItem(storageKey)
  } catch {
    // Sem armazenamento: não havia o que apagar.
  }
}

export function removeDraft(storageKey: string): void {
  remove(storageKey)
  notify()
}

/** Apaga os rascunhos de um usuário ("Sair" de propósito). */
export function clearDraftsOf(userId: string): void {
  const prefix = draftStorageKey(userId, '')
  const keys = [...memory.keys()]
  try {
    for (let index = 0; index < sessionStorage.length; index += 1) keys.push(sessionStorage.key(index) ?? '')
  } catch {
    // Sem armazenamento: só o que está na memória.
  }
  keys.filter((key) => key.startsWith(prefix)).forEach(remove)
  notify()
}
