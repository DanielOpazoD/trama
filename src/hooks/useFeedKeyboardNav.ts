import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * ¿El foco está en un campo editable? Si es así, los atajos de una sola tecla
 * (`n`, `/`, `j`, `k`) NO deben dispararse — el usuario está escribiendo. PURA y
 * exportada para testearse sin montar el hook.
 */
export function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

type FeedKeyboardNavOptions = {
  /** ¿El feed está activo (visible/enfocable)? Si no, no se enganchan atajos. */
  enabled: boolean
  /** Cantidad de ítems navegables del feed (para acotar j/k). */
  itemCount: number
  /** `n` → enfocar el composer (nueva nota). */
  onFocusComposer: () => void
  /** `/` → abrir/enfocar el buscador. */
  onOpenSearch: () => void
  /** `Enter` sobre la tarjeta seleccionada → acción primaria (expandir/abrir). */
  onActivate?: (index: number) => void
}

/**
 * Navegación por teclado scopeada al feed de Notas. Atajos de una tecla cuando
 * el feed está activo y el foco NO está en un input/textarea/contenteditable:
 *
 *   n   → enfoca el composer
 *   /   → abre/enfoca el buscador
 *   j/k → mueve la selección visual entre tarjetas (con scroll-into-view)
 *   Enter (sobre una tarjeta seleccionada) → acción primaria
 *   Esc → limpia la selección
 *
 * Devuelve el índice seleccionado (o `null`) y un `setSelected` para que la
 * vista resalte la tarjeta. El listener vive en `document` y se limpia solo.
 */
export function useFeedKeyboardNav({
  enabled,
  itemCount,
  onFocusComposer,
  onOpenSearch,
  onActivate,
}: FeedKeyboardNavOptions) {
  const [selected, setSelected] = useState<number | null>(null)

  // Guardamos las callbacks/valores en refs para no re-suscribir el listener en
  // cada render (las funciones cambian de identidad seguido).
  const stable = useRef({ itemCount, onFocusComposer, onOpenSearch, onActivate })
  stable.current = { itemCount, onFocusComposer, onOpenSearch, onActivate }

  // Si la lista se encoge, no dejes la selección fuera de rango.
  useEffect(() => {
    setSelected((cur) => (cur === null ? null : cur >= itemCount ? null : cur))
  }, [itemCount])

  const handler = useCallback((e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (isTypingTarget(e.target)) return
    const { itemCount, onFocusComposer, onOpenSearch, onActivate } = stable.current

    switch (e.key) {
      case 'n':
        e.preventDefault()
        onFocusComposer()
        break
      case '/':
        e.preventDefault()
        onOpenSearch()
        break
      case 'j':
        if (itemCount === 0) return
        e.preventDefault()
        setSelected((cur) => (cur === null ? 0 : Math.min(cur + 1, itemCount - 1)))
        break
      case 'k':
        if (itemCount === 0) return
        e.preventDefault()
        setSelected((cur) => (cur === null ? 0 : Math.max(cur - 1, 0)))
        break
      case 'Enter':
        setSelected((cur) => {
          if (cur !== null && onActivate) {
            e.preventDefault()
            onActivate(cur)
          }
          return cur
        })
        break
      case 'Escape':
        setSelected((cur) => (cur === null ? null : null))
        break
      default:
        break
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [enabled, handler])

  return { selected, setSelected }
}
