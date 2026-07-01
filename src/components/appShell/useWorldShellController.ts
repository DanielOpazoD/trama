import { useCallback, useEffect, useState } from 'react'
import { clearUserPrefsMirror, readUserPrefsMirror } from '../../state'
import { useCurrentClientUserId } from '../../lib/clientIdentity'
import { startViewTransition } from '../../lib/viewTransition'
import {
  readWorldDeepLinkFromSearch,
  resolveRecortesRedirectSearch,
} from '../../lib/worldShellRouting'
import type { NotasSection } from '../../types/notas'
import { DEFAULT_WORLD, WORLD_STORAGE_KEY, type World } from '../../types/world'
import { useWorldThemeClass } from '../../hooks/useWorldThemeClass'
import {
  resolveInitialNotasSection,
  resolveInitialWorld,
  resolveNextWorldForClientUser,
} from './worldShellModel'

let recortesRedirectApplied = false

function applyRecortesRedirectOnce() {
  if (recortesRedirectApplied || typeof window === 'undefined') return
  recortesRedirectApplied = true
  const search = resolveRecortesRedirectSearch(window.location.search)
  if (!search) return
  try {
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${search}${window.location.hash}`,
    )
  } catch {
    /* replaceState no disponible: el deep-link viejo no rompe nada */
  }
}

function readStoredWorld(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(WORLD_STORAGE_KEY)
  } catch {
    return null
  }
}

export function useWorldShellController({
  preloadWorldBundle,
}: {
  preloadWorldBundle: (world: World) => void
}) {
  applyRecortesRedirectOnce()
  const initialSearch = typeof window === 'undefined' ? '' : window.location.search
  const initialWorldFromUrl =
    typeof window === 'undefined' ? null : readWorldDeepLinkFromSearch(initialSearch)
  const [world, setWorld] = useState<World>(() => {
    if (typeof window === 'undefined') return DEFAULT_WORLD
    return resolveInitialWorld({
      initialWorldFromUrl,
      savedWorld: readStoredWorld(),
      defaultWorld: readUserPrefsMirror().defaultWorld,
    })
  })
  const [pendingNotasSection, setPendingNotasSection] = useState<NotasSection | null>(
    () => resolveInitialNotasSection({ initialWorldFromUrl, search: initialSearch }),
  )

  const changeWorld = useCallback((w: World) => {
    if (w !== 'notas') setPendingNotasSection(null)
    startViewTransition(() => setWorld(w))
    try {
      window.localStorage.setItem(WORLD_STORAGE_KEY, w)
    } catch {
      /* storage deshabilitado */
    }
  }, [])

  useEffect(() => {
    if (!initialWorldFromUrl) return
    try {
      window.localStorage.setItem(WORLD_STORAGE_KEY, initialWorldFromUrl)
    } catch {
      /* storage deshabilitado */
    }
  }, [initialWorldFromUrl])

  useEffect(() => {
    const t = window.setTimeout(() => preloadWorldBundle('notas'), 1200)
    return () => window.clearTimeout(t)
  }, [preloadWorldBundle])

  const clientUserId = useCurrentClientUserId()
  useEffect(() => {
    if (!clientUserId) return
    let last: string | null = null
    try {
      last = window.localStorage.getItem('trama:auth-user')
    } catch {
      return
    }
    const nextWorld = resolveNextWorldForClientUser({
      clientUserId,
      previousClientUserId: last,
    })
    if (!nextWorld.shouldPersistUser) return
    if (nextWorld.shouldResetWorld) {
      clearUserPrefsMirror()
      try {
        window.localStorage.removeItem(WORLD_STORAGE_KEY)
      } catch {
        /* ignore */
      }
      setPendingNotasSection(null)
      setWorld(DEFAULT_WORLD)
    }
    try {
      window.localStorage.setItem('trama:auth-user', clientUserId)
    } catch {
      /* ignore */
    }
  }, [clientUserId])

  useWorldThemeClass(world)

  const revealNotasModule = useCallback(
    (moduleId: NotasSection) => {
      setPendingNotasSection(moduleId)
      changeWorld('notas')
    },
    [changeWorld],
  )

  return {
    world,
    changeWorld,
    pendingNotasSection,
    revealNotasModule,
  }
}
