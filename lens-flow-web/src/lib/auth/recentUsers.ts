/**
 * Últimos usuários que entraram neste aparelho (R16). Fica só no aparelho,
 * sem senha: serve para o "Trocar usuário" ser rápido no aparelho compartilhado.
 */
export interface RecentUser {
  username: string
  name: string
}

const STORAGE_KEY = 'lf:recent-users'
const MAX_RECENT = 5

export function getRecentUsers(): RecentUser[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item): item is RecentUser =>
        typeof item?.username === 'string' && typeof item?.name === 'string',
    )
  } catch {
    return []
  }
}

export function rememberRecentUser(user: RecentUser): void {
  const others = getRecentUsers().filter((item) => item.username !== user.username)
  const next = [{ username: user.username, name: user.name }, ...others].slice(0, MAX_RECENT)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Armazenamento cheio ou bloqueado: a lista é só uma conveniência.
  }
}

export function forgetRecentUser(username: string): void {
  const next = getRecentUsers().filter((item) => item.username !== username)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Idem.
  }
}
