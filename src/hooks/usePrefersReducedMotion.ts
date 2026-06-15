import { useEffect, useState } from 'react'

/**
 * Devuelve `true` cuando el usuario pidió reducir el movimiento
 * (`prefers-reduced-motion: reduce`). Escucha cambios del media query, así que
 * el valor se mantiene fresco si el sistema cambia de preferencia en caliente.
 *
 * Útil para guardar animaciones JS-driven (delays escalonados, etc.) — las
 * animaciones puramente CSS ya se desactivan vía el `@media` en `index.css`,
 * pero un `animationDelay` inline o un `animate-fade-up` escalonado necesitan
 * este guard del lado de React para no aplicarse cuando reduce-motion está on.
 */
export function usePrefersReducedMotion(): boolean {
  const getMatch = () =>
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [reduced, setReduced] = useState(getMatch)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', handler)
    else mq.addListener(handler)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler)
      else mq.removeListener(handler)
    }
  }, [])

  return reduced
}
