import { useEffect, useState } from 'react'

/**
 * δ5: Number ticker — anima de un valor a otro con easing.
 *
 * Cuando el sidebar pasa de "63" a "64" porque agregaste una entidad, en
 * lugar de saltar abruptamente cuenta los dígitos en ~400ms con la curva
 * out-quart. Subtle pero psicológicamente importante: refuerza la conexión
 * entre tu acción (añadir) y el contador (sube). Lo hace Linear, Stripe,
 * Figma — todos los productos que toman en serio el feedback numérico.
 *
 * Implementación: pure JS animation con requestAnimationFrame. Sin
 * dependencies. Respeta prefers-reduced-motion (salta directo al final).
 *
 * Renderiza con tabular-nums activo para que los dígitos tengan el mismo
 * ancho y no haya "jiggle" mientras corre.
 */

const ANIM_MS = 420

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

export function NumberTicker({
  value,
  className = '',
}: {
  value: number
  className?: string
}) {
  // `display` es lo que aparece en pantalla; `target` es el valor "verdad".
  // Cuando target cambia, animamos display hacia él.
  const [display, setDisplay] = useState(value)

  useEffect(() => {
    // Reduce motion: salto directo, sin animación.
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setDisplay(value)
      return
    }

    const start = display
    const end = value
    if (start === end) return

    const startedAt = performance.now()
    let raf = 0

    function tick(now: number) {
      const elapsed = now - startedAt
      const t = Math.min(elapsed / ANIM_MS, 1)
      const eased = easeOutQuart(t)
      const next = Math.round(start + (end - start) * eased)
      setDisplay(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
    // El effect lo dispara value (objetivo). NO incluimos display
    // porque sería un loop: cada setDisplay re-ejecutaría el effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={`tabular-nums ${className}`}>{display}</span>
}
