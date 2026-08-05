import { useEffect, useState } from 'react'

/** Duración del fundido (espejo de `animation.media-reveal` en Tailwind).
 *  El timeout de limpieza va un poco después para no soltar el placeholder a
 *  mitad de animación. */
const REVEAL_MS = 300

/**
 * El "revelado" de la media autenticada: cuando el blob resuelve, la imagen no
 * aparece de golpe — funde de 0 a 1 en ~300ms sobre su placeholder.
 *
 * **Por qué una ANIMACIÓN por keyframes y no una transition.** Varios tiles ya
 * traen `transition-transform` (hover-zoom) y dos utilidades de transition
 * compiten por `transition-property`: la que gana la pelea de CSS apaga a la
 * otra — medido en el álbum, donde el fundido por transition quedaba muerto
 * con las clases puestas. Un keyframe anima opacity sin tocar esa propiedad.
 *
 * **Por qué fases.** El placeholder vive como `background-color` DEL MISMO
 * `<img>` (decisión previa: el img siempre montado, accesible y estable), así
 * que hay que sostenerlo durante el fundido y soltarlo al terminar —
 * importante para object-contain: un fondo permanente pintaría el letterbox.
 *
 *   waiting → placeholder pintado, sin animación (cargando, como siempre).
 *   fading  → blob resuelto: keyframe de 0→1 sobre el placeholder aún pintado.
 *   done    → animación terminada; el placeholder se suelta.
 *
 * `motion-reduce:animate-none` respeta `prefers-reduced-motion`.
 * Si `ready` vuelve a false (cambio de storageKey), se reinicia a waiting.
 */
export function useMediaReveal(ready: boolean): {
  /** Clases de revelado para el elemento de media. */
  revealClass: string
  /** true mientras el placeholder de fondo debe seguir pintado. */
  showPlaceholder: boolean
} {
  // La clase de fundido se deriva DEL RENDER de `ready`, no de un efecto: un
  // useEffect corre tras el commit y regalaría un frame con la imagen a
  // opacidad plena antes de arrancar la animación (pop + reinicio). El estado
  // solo gobierna la limpieza del placeholder, que sí puede llegar tarde.
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    if (!ready) {
      setSettled(false)
      return
    }
    const timer = setTimeout(() => setSettled(true), REVEAL_MS + 80)
    return () => clearTimeout(timer)
  }, [ready])

  return {
    revealClass: ready
      ? 'opacity-100 animate-media-reveal motion-reduce:animate-none'
      : 'opacity-100',
    showPlaceholder: !ready || !settled,
  }
}
