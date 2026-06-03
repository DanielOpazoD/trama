import { useLayoutEffect, useRef } from 'react'

/**
 * Hace que un `<textarea>` crezca con su contenido entre `minRows` y `maxRows`
 * (luego aparece scroll). Sin dependencias: mide con `scrollHeight` usando el
 * patrón reset-then-measure (alto a `auto`, leer, fijar). Solo toca
 * `style.height`/`overflowY` — la tipografía y el espaciado siguen en las clases
 * del design system. Devuelve la ref para enganchar al textarea.
 */
export function useAutosizeTextarea(
  value: string,
  opts: { minRows?: number; maxRows?: number } = {},
) {
  const { minRows = 2, maxRows = 12 } = opts
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      const cs = window.getComputedStyle(el)
      const line = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4 || 20
      const extra =
        (parseFloat(cs.paddingTop) || 0) +
        (parseFloat(cs.paddingBottom) || 0) +
        (parseFloat(cs.borderTopWidth) || 0) +
        (parseFloat(cs.borderBottomWidth) || 0)
      const min = line * minRows + extra
      const max = line * maxRows + extra

      // Reset-then-measure: sin el reset, scrollHeight nunca decrece al borrar.
      el.style.height = 'auto'
      const content = el.scrollHeight
      el.style.height = `${Math.min(max, Math.max(min, content))}px`
      el.style.overflowY = content > max ? 'auto' : 'hidden'
    }

    fit()

    // Si cambia el ANCHO (responsive, sidebar), el wrapping altera el alto → re-
    // medir. Guardamos el ancho para ignorar los cambios de alto del propio `fit`
    // (evita el bucle clásico de ResizeObserver).
    if (typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth
      if (w === lastWidth) return
      lastWidth = w
      fit()
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, minRows, maxRows])

  return ref
}
