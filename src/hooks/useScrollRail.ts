import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Un carril que se desplaza en horizontal no anuncia que sigue.
 *
 * En la barra de secciones del mundo Notas, a 375px, el contenido medía 776px
 * dentro de 232px visibles: cinco de las ocho secciones (Prompts, Claves,
 * Imprenta, Planillas, Biblioteca) no existían para el usuario, sin degradado
 * ni flecha ni scrollbar — en macOS la barra sólo aparece mientras arrastras.
 * Y la sección activa llegaba cortada a media palabra («Tare»), porque nada la
 * traía a la vista.
 *
 * Los gates no lo veían y la sonda de oclusión tampoco, con razón: el contenido
 * *es* alcanzable con scroll. Es un fallo de descubribilidad, no de
 * alcanzabilidad.
 *
 * Este hook devuelve las dos mitades del arreglo:
 *   - `ref`, para el contenedor con overflow.
 *   - `hint`, qué lado tiene contenido por recorrer, para desvanecer ese borde.
 *   - `traerALaVista`, para que el elemento activo se muestre entero.
 */
export function useScrollRail<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [hint, setHint] = useState({ inicio: false, fin: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const medir = () => {
      const restante = el.scrollWidth - el.clientWidth - el.scrollLeft
      // 1px de tolerancia: los anchos subpíxel dejan restos que no son scroll.
      setHint({ inicio: el.scrollLeft > 1, fin: restante > 1 })
    }

    medir()
    el.addEventListener('scroll', medir, { passive: true })

    // El contenedor avisa si cambia su caja, pero no si cambia la de sus hijos
    // — y el ancho del contenido sí se mueve cuando cargan las tipografías.
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    for (const hijo of el.children) observer.observe(hijo)

    return () => {
      el.removeEventListener('scroll', medir)
      observer.disconnect()
    }
  }, [])

  /**
   * Trae a la vista el elemento activo. `nearest` en ambos ejes: mueve lo
   * mínimo y, sobre todo, no arrastra el scroll vertical de la página.
   * Sin `smooth` a propósito — es una corrección de encuadre, no una
   * animación, y así no hay nada que exceptuar bajo `prefers-reduced-motion`.
   */
  const traerALaVista = useCallback((selector: string) => {
    ref.current
      ?.querySelector(selector)
      ?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [])

  return { ref, hint, traerALaVista }
}

/**
 * Azúcar para el caso habitual: el activo se marca con `aria-current="page"` y
 * hay que reencuadrarlo cada vez que cambia cuál es.
 */
export function useScrollRailWithActive<T extends HTMLElement>(activo: unknown) {
  const rail = useScrollRail<T>()
  const { traerALaVista } = rail

  useEffect(() => {
    traerALaVista('[aria-current="page"]')
  }, [activo, traerALaVista])

  return rail
}
