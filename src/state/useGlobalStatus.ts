import { useEffect, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { useOffline } from './offline'

/**
 * η1: Filtro para useIsMutating — solo contamos mutations que
 * efectivamente persisten data. Las que vienen de flujos IA donde el
 * usuario tiene que aceptar/descartar antes de guardar (extract,
 * suggest, reclassify, reflect, generate proactive) están marcadas con
 * meta.silent=true en su definición.
 *
 * Sin este filtro, apretar "reclasificar con IA" disparaba "guardando…"
 * en el indicador global aunque nada se hubiera guardado todavía —
 * confundía al usuario sobre qué acciones persisten.
 */
function isPersistMutation(mutation: {
  state?: unknown
  options?: { meta?: { silent?: boolean } }
}): boolean {
  return mutation.options?.meta?.silent !== true
}

export type GlobalStatus =
  | { kind: 'idle' }
  | { kind: 'saving'; pending: number }
  | { kind: 'saved' }
  | { kind: 'offline' }

/**
 * Devuelve el estado "global" del backend que vale la pena mostrar en el
 * top bar como un indicador discreto.
 *
 * Combina dos fuentes:
 *   1. `useIsMutating()` — cuántas mutations de TanStack están en vuelo.
 *      Si >0, mostramos "guardando…".
 *   2. `useOffline()` — si estamos en modo local persistente. Esto ganan
 *      al estado de "guardando" porque indica un problema más grave.
 *
 * Además, sostiene el estado "guardado" durante 1.2s tras una mutation
 * exitosa, para dar feedback visual de que algo SÍ se persistió. Sin esto,
 * el indicador parpadea y se va sin que el usuario lo registre.
 *
 * El "guardado" no aparece la PRIMERA vez (estado inicial → saving → saved
 * sería ruido al cargar la app), solo después de la primera transición
 * saving→idle.
 */
export function useGlobalStatus(): GlobalStatus {
  // useIsMutating con predicate — solo cuenta mutations no-silent.
  // Las AI propose mutations llevan meta.silent=true y son ignoradas.
  const isMutating = useIsMutating({
    predicate: (m) =>
      isPersistMutation(m as { options?: { meta?: { silent?: boolean } } }),
  })
  const { offline } = useOffline()
  const [showSaved, setShowSaved] = useState(false)
  const wasMutatingRef = useRef(false)
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const wasMutating = wasMutatingRef.current
    const isNowMutating = isMutating > 0

    if (isNowMutating && !wasMutating) {
      // Empezó una mutation — limpiamos el "guardado" si quedaba
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      setShowSaved(false)
    } else if (!isNowMutating && wasMutating) {
      // Terminó una mutation — mostramos "guardado" 1.2s
      setShowSaved(true)
      timeoutRef.current = window.setTimeout(() => {
        setShowSaved(false)
        timeoutRef.current = null
      }, 1200)
    }

    wasMutatingRef.current = isNowMutating

    return () => {
      // No limpiamos el timeout aquí — si el componente vive, queremos que
      // el "guardado" se quede su 1.2s. Solo se limpia si arranca otra
      // mutation o al unmount real (abajo).
    }
  }, [isMutating])

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  if (offline) return { kind: 'offline' }
  if (isMutating > 0) return { kind: 'saving', pending: isMutating }
  if (showSaved) return { kind: 'saved' }
  return { kind: 'idle' }
}
