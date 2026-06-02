import { useSyncExternalStore } from 'react'

let currentClientUserId: string | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

export function setCurrentClientUserId(userId: string | null): () => void {
  currentClientUserId = userId
  emit()
  return () => {
    if (currentClientUserId === userId) {
      currentClientUserId = null
      emit()
    }
  }
}

export function getCurrentClientUserId(): string | null {
  return currentClientUserId
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCurrentClientUserId(): string | null {
  return useSyncExternalStore(subscribe, getCurrentClientUserId, () => null)
}
