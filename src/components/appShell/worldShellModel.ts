import { readNotasSectionDeepLinkFromSearch } from '../../lib/worldShellRouting'
import type { NotasSection } from '../../types/notas'
import type { ViewMode } from '../../types/view'
import type { CommandAction } from '../../hooks/useCommandSearch'
import { DEFAULT_WORLD, type World } from '../../types/world'

/** Adónde lleva el buscador usado desde otro mundo: Trama monta ahí. */
export type TramaTarget =
  | { kind: 'view'; view: ViewMode }
  | { kind: 'entity'; id: string }
  | { kind: 'thread'; threadId: string }
  | { kind: 'action'; action: CommandAction }

export type InitialWorldInput = {
  initialWorldFromUrl: World | null
  savedWorld: string | null
  defaultWorld: string | null | undefined
}

function isWorld(value: unknown): value is World {
  return value === 'notas' || value === 'trama'
}

export function resolveInitialWorld({
  initialWorldFromUrl,
  savedWorld,
  defaultWorld,
}: InitialWorldInput): World {
  if (initialWorldFromUrl) return initialWorldFromUrl
  if (isWorld(savedWorld)) return savedWorld
  if (isWorld(defaultWorld)) return defaultWorld
  return DEFAULT_WORLD
}

export function resolveInitialNotasSection({
  initialWorldFromUrl,
  search,
}: {
  initialWorldFromUrl: World | null
  search: string
}): NotasSection | null {
  if (initialWorldFromUrl !== 'notas') return null
  return readNotasSectionDeepLinkFromSearch(search)
}

export function resolveNextWorldForClientUser({
  clientUserId,
  previousClientUserId,
}: {
  clientUserId: string | null
  previousClientUserId: string | null
}): { shouldPersistUser: boolean; shouldResetWorld: boolean } {
  if (!clientUserId || previousClientUserId === clientUserId) {
    return { shouldPersistUser: false, shouldResetWorld: false }
  }
  return {
    shouldPersistUser: true,
    shouldResetWorld: previousClientUserId !== null,
  }
}
