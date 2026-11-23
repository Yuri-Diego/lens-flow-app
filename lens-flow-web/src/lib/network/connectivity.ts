import { useSyncExternalStore } from 'react'

/**
 * Estado da conexão: o navegador está online e o servidor respondeu?
 * O cliente da API avisa aqui a cada resposta ou falha de rede.
 */
export interface ConnectivityState {
  online: boolean
  serverReachable: boolean
}

const listeners = new Set<() => void>()

let state: ConnectivityState = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  serverReachable: true,
}

function setState(next: Partial<ConnectivityState>): void {
  const merged = { ...state, ...next }
  if (merged.online === state.online && merged.serverReachable === state.serverReachable) return
  state = merged
  listeners.forEach((listener) => listener())
}

export function reportServerReachable(): void {
  setState({ serverReachable: true })
}

export function reportServerUnreachable(): void {
  setState({ serverReachable: false })
}

/** Só para testes: volta ao estado inicial. */
export function resetConnectivity(): void {
  state = { online: true, serverReachable: true }
  listeners.forEach((listener) => listener())
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setState({ online: true }))
  window.addEventListener('offline', () => setState({ online: false }))
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useConnectivity(): ConnectivityState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
