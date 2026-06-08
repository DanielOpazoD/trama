import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Devuelve `true` una vez que el elemento entra (o se acerca a) el viewport, y se
 * queda en `true` (one-shot). Sirve para DIFERIR el trabajo caro —el render de una
 * miniatura con pdf.js— a las páginas que el usuario realmente mira, SIN desmontar
 * nada: la grilla entera sigue en el DOM, así reordenar (drag/teclado) y la
 * selección quedan intactos. `rootMargin` precarga un poco antes de entrar en
 * pantalla. Sin `IntersectionObserver` (entornos viejos) asume visible.
 */
export function useInViewport<T extends Element>({
  root = null,
  rootMargin = '400px',
}: { root?: Element | null; rootMargin?: string } = {}): [RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { root, rootMargin },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [inView, root, rootMargin])
  return [ref, inView]
}
