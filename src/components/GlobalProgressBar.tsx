import { useIsFetching, useIsMutating } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

/**
 * Barra fina (1px) en la parte superior de la app que se enciende
 * cuando hay queries en vuelo. Inspirada en YouTube / GitHub / Vercel —
 * da sensación de "el sistema está vivo" sin gritar.
 *
 * Comportamiento:
 *   - Se enciende cuando hay >=1 query fetching o mutation pendiente.
 *   - Indeterminada (animación de barrido) — no es % real.
 *   - Se apaga con un fade-out suave de 300ms cuando todo terminó.
 *   - Color: accent-primary (azul prusia) en light, alma cálida en
 *     dark gracias a las CSS vars.
 *
 * El componente se monta una vez en App.tsx, no en cada vista.
 * `prefers-reduced-motion` lo deja como una barra estática semitransparente.
 */
export function GlobalProgressBar() {
  const fetchingCount = useIsFetching()
  const mutatingCount = useIsMutating()
  const active = fetchingCount + mutatingCount > 0

  // Para evitar parpadeo en queries muy cortas (<200ms), retrasamos el
  // show. Para evitar que el fade-out se sienta abrupto, mantenemos
  // visible 300ms después de que todo terminó.
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (active) {
      const t = setTimeout(() => setVisible(true), 200)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setVisible(false), 300)
    return () => clearTimeout(t)
  }, [active])

  return (
    <div
      aria-hidden
      className="fixed inset-x-0 top-0 z-[60] h-[2px] overflow-hidden pointer-events-none transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div
        className="h-full progress-indeterminate"
        style={{
          width: '40%',
          backgroundColor: 'var(--accent-primary)',
          opacity: 0.85,
        }}
      />
    </div>
  )
}
