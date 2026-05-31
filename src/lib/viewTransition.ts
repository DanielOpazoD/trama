import { flushSync } from 'react-dom'

/**
 * Wrapper sobre la View Transitions API (Chrome 111+, Safari 18+).
 *
 * Permite animar transiciones entre estados de React usando el "shared
 * element transition" del navegador: dos elementos con el mismo
 * `view-transition-name` se animan automáticamente del uno al otro
 * cuando uno aparece donde estaba el otro.
 *
 * Si el navegador no soporta la API (Firefox por ahora, browsers viejos),
 * el callback corre normal y el state cambia sin animación. Feature-detect
 * silenciosa — no degrada el producto.
 *
 * Uso típico:
 *   selectEntityWithTransition(id)
 *     ↓
 *   startViewTransition(() => setSelectedEntityId(id))
 *
 * El callback se ejecuta dentro de `flushSync` para que React commitee
 * el render ANTES de que el browser tome el snapshot "después". Sin
 * eso, la transición no se dispararía.
 */

export function startViewTransition(callback: () => void): void {
  if (typeof document === 'undefined') {
    callback()
    return
  }
  // El método está en lib.dom.d.ts (TS 5.5+), pero algunos targets aún
  // lo tipan como opcional. Feature detect en runtime es lo correcto:
  // Firefox por ahora no lo implementa.
  if (typeof document.startViewTransition !== 'function') {
    callback()
    return
  }

  // Respect prefers-reduced-motion — el usuario pidió no animar.
  // Igual ejecutamos el callback, solo saltamos la animación.
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  const transition = document.startViewTransition(() => {
    // flushSync fuerza React a commitear ANTES de que el browser
    // capture el snapshot "después". Sin esto, el state update se
    // batchearía y la transición no encontraría el nuevo layout.
    flushSync(callback)
  })
  transition.finished.catch((error: unknown) => {
    if (error instanceof Error && error.name === 'AbortError') return
    throw error
  })

  if (reduceMotion) {
    transition.skipTransition()
  }
}
