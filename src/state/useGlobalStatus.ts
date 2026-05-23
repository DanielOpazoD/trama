import { useEffect, useRef, useState } from 'react'
import { useIsMutating } from '@tanstack/react-query'
import { useOffline } from './offline'

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
  const isMutating = useIsMutating()
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
