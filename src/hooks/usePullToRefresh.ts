import { useEffect, useRef, useState } from 'react'

/**
 * Pull-to-refresh hook para listas largas en mobile.
 *
 * Patrón nativo iOS/Android: el usuario arrastra hacia abajo desde el
 * tope de la lista; cuando supera el threshold (~64px) y suelta, se
 * dispara la callback.
 *
 * Diseño:
 *   - Solo se activa cuando el scroll está en el tope (scrollTop === 0)
 *   - Funciona únicamente en dispositivos coarse pointer (touch real)
 *   - Devuelve `pullDistance` (0..1) para mostrar un indicador visual
 *   - Devuelve `refreshing` true mientras la promise no resuelve
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null)
 *   const { pullDistance, refreshing } = usePullToRefresh(ref, async () => {
 *     await query.refetch()
 *   })
 *
 * El caller dibuja el indicador donde quiera, usando `pullDistance`
 * para opacidad/scale y `refreshing` para el spinner.
 */

const THRESHOLD = 64 // px
const MAX_PULL = 120 // hard ceiling para que el "rubber band" no infinite

export function usePullToRefresh(
  scrollContainerRef: React.RefObject<HTMLElement>,
  onRefresh: () => Promise<unknown>,
): { pullDistance: number; refreshing: boolean } {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startYRef = useRef<number | null>(null)
  // Cuando refreshing arranca, congelamos el handler para no doblar.
  const refreshingRef = useRef(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    // Solo activamos en dispositivos sin hover (touch real).
    const isTouch =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: none) and (pointer: coarse)').matches
    if (!isTouch) return

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current) return
      if (!el || el.scrollTop > 0) return
      startYRef.current = e.touches[0]?.clientY ?? null
    }

    function onTouchMove(e: TouchEvent) {
      if (refreshingRef.current) return
      if (startYRef.current === null) return
      if (!el || el.scrollTop > 0) {
        startYRef.current = null
        setPullDistance(0)
        return
      }
      const currentY = e.touches[0]?.clientY ?? startYRef.current
      const delta = currentY - startYRef.current
      if (delta > 0) {
        // Resistance: el pull se desacelera después del threshold
        const resisted = delta < THRESHOLD ? delta : THRESHOLD + (delta - THRESHOLD) * 0.4
        const capped = Math.min(resisted, MAX_PULL)
        setPullDistance(capped / THRESHOLD) // 0..(MAX_PULL/THRESHOLD)
      }
    }

    async function onTouchEnd() {
      if (refreshingRef.current) return
      const distance = pullDistance
      startYRef.current = null
      if (distance >= 1) {
        refreshingRef.current = true
        setRefreshing(true)
        try {
          await onRefresh()
        } finally {
          refreshingRef.current = false
          setRefreshing(false)
          setPullDistance(0)
        }
      } else {
        setPullDistance(0)
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [scrollContainerRef, onRefresh, pullDistance])

  return { pullDistance, refreshing }
}
