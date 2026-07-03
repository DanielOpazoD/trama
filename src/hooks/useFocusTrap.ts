import { useEffect, type RefObject } from 'react'

/**
 * BB6: focus trap reutilizable para modales (WCAG 2.4.3 + 2.1.2).
 *
 * Cuando un modal está abierto:
 *  1. Mueve el foco al primer elemento focuseable del contenedor (a menos
 *     que el modal ya haya puesto autoFocus en algo, en cuyo caso se lo
 *     respeta).
 *  2. Intercepta Tab/Shift+Tab para ciclar dentro del modal (sin
 *     escaparse al fondo).
 *  3. Al cerrar, restaura el foco al elemento que estaba activo antes
 *     de abrir — para que el lector de pantalla y el usuario teclado
 *     no pierdan el contexto.
 *
 * Uso:
 *   const ref = useRef<HTMLDivElement>(null)
 *   useFocusTrap(ref, open)
 *   ...
 *   <div ref={ref} role="dialog">...</div>
 *
 * No es full WAI-ARIA APG (no maneja "click fuera para cerrar", roving
 * tabindex, etc.) — eso lo siguen haciendo los modales individualmente.
 * Esto solo cubre el trap + restore, que era el gap concreto del audit.
 */
// Default a nivel de módulo: un `= []` inline crearía un array nuevo por
// render y el efecto (que depende de extraRoots) se re-ejecutaría siempre,
// robando el foco a mitad de escritura en todos los modales.
const NO_EXTRA_ROOTS: RefObject<HTMLElement | null>[] = []

export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  /** Contenedores extra que cuentan como "dentro" del trap (p. ej. paneles
   *  flotantes portaleados al body). El array debe ser de identidad estable. */
  extraRoots: RefObject<HTMLElement | null>[] = NO_EXTRA_ROOTS,
): void {
  useEffect(() => {
    if (!active) return
    const root = ref.current
    if (!root) return
    const allRoots = () =>
      [root, ...extraRoots.map((extra) => extra.current)].filter(
        (candidate): candidate is HTMLElement => Boolean(candidate),
      )
    const containsFocus = (el: Element | null) =>
      Boolean(el && allRoots().some((candidate) => candidate.contains(el)))
    const allFocusables = () => {
      // En orden de documento, para que Tab cicle de forma predecible entre
      // el modal y los paneles extra.
      const focusables = allRoots().flatMap((candidate) =>
        getFocusableElements(candidate),
      )
      return focusables.sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )
    }

    // Guardar el elemento que tenía foco antes de abrir — el browser
    // lo persiste en document.activeElement, pero solo en ese instante.
    const previousFocus = document.activeElement as HTMLElement | null

    // Si nadie puso autoFocus, mover el foco al primero focuseable del
    // modal. Damos un microtick para que el DOM se haya pintado y los
    // refs internos del modal (si los hay) estén listos.
    const id = window.setTimeout(() => {
      const focusables = allFocusables()
      const alreadyInside = containsFocus(document.activeElement)
      if (!alreadyInside && focusables.length > 0) {
        focusables[0]!.focus()
      }
    }, 0)

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Tab') return
      if (!root) return
      const focusables = allFocusables()
      if (focusables.length === 0) {
        // Sin focuseables el modal igual no debería tragar el Tab.
        return
      }
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      const current = document.activeElement as HTMLElement | null

      // Shift+Tab desde el primero → ir al último.
      if (e.shiftKey && current === first) {
        e.preventDefault()
        last.focus()
        return
      }
      // Tab desde el último → ir al primero.
      if (!e.shiftKey && current === last) {
        e.preventDefault()
        first.focus()
        return
      }
      // Si el foco escapó del trap (puede pasar por errores upstream),
      // re-anclar al primero.
      if (current && !containsFocus(current)) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKeyDown)
      // Restaurar el foco al elemento de origen. Solo si sigue en el DOM
      // (puede haber sido removido entre tanto).
      if (previousFocus && document.contains(previousFocus)) {
        previousFocus.focus()
      }
    }
  }, [active, ref, extraRoots])
}

/**
 * Selector estándar para "elementos focuseables visibles". Cubre los
 * casos que importan: links, buttons, inputs/textareas/selects no
 * deshabilitados, y cualquier cosa con tabindex >= 0.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

function getFocusableElements(root: HTMLElement): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
  // Filtrar los que están display:none o aria-hidden (no son
  // focuseables realmente). Conservadores: si el browser puede enfocarlos,
  // los aceptamos.
  return all.filter((el) => {
    if (el.hasAttribute('disabled')) return false
    if (el.getAttribute('aria-hidden') === 'true') return false
    // offsetParent === null cuando el elemento o un ancestor tiene
    // display:none (no para visibility:hidden). Suficiente para nuestro
    // caso — los modales no usan visibility:hidden para esconder cosas
    // que sí son interactivas.
    if (el.offsetParent === null && el.tagName !== 'BODY') return false
    return true
  })
}
