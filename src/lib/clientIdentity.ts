import { useSyncExternalStore } from 'react'

let currentClientUserId: string | null = null
let currentClientUserLabel: string | null = null
let currentClientUserEmail: string | null = null
let currentClientUserProfile = {
  userId: null as string | null,
  label: null as string | null,
  email: null as string | null,
}
const listeners = new Set<() => void>()

function syncProfile() {
  currentClientUserProfile = {
    userId: currentClientUserId,
    label: currentClientUserLabel,
    email: currentClientUserEmail,
  }
}

function emit() {
  syncProfile()
  for (const listener of listeners) listener()
}

export function setCurrentClientUserId(userId: string | null): () => void {
  currentClientUserId = userId
  currentClientUserLabel = null
  currentClientUserEmail = null
  emit()
  return () => {
    if (currentClientUserId === userId) {
      currentClientUserId = null
      currentClientUserLabel = null
      currentClientUserEmail = null
      emit()
    }
  }
}

export function setCurrentClientUser(input: {
  userId: string | null
  label?: string | null
  email?: string | null
}): () => void {
  currentClientUserId = input.userId
  currentClientUserLabel = input.label?.trim() || null
  currentClientUserEmail = input.email?.trim() || null
  emit()
  return () => {
    if (currentClientUserId === input.userId) {
      currentClientUserId = null
      currentClientUserLabel = null
      currentClientUserEmail = null
      emit()
    }
  }
}

export function getCurrentClientUserId(): string | null {
  return currentClientUserId
}

export function getCurrentClientUserProfile(): {
  userId: string | null
  label: string | null
  email: string | null
} {
  return currentClientUserProfile
}

const EMPTY_CLIENT_USER_PROFILE = { userId: null, label: null, email: null }

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useCurrentClientUserId(): string | null {
  return useSyncExternalStore(subscribe, getCurrentClientUserId, () => null)
}

export function useCurrentClientUserProfile(): {
  userId: string | null
  label: string | null
  email: string | null
} {
  return useSyncExternalStore(
    subscribe,
    getCurrentClientUserProfile,
    () => EMPTY_CLIENT_USER_PROFILE,
  )
}
