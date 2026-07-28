import { render, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useScrollRail, useScrollRailWithActive } from './useScrollRail'

/**
 * happy-dom no hace layout, así que las medidas se fijan a mano: lo que se
 * prueba aquí es la aritmética del carril y el ciclo de vida de los listeners.
 * Que el degradado y el reencuadre se vean de verdad lo comprueba
 * `e2e/scroll-rail.spec.ts`, que sí mide geometría pintada.
 *
 * Se monta un componente real y no `renderHook` a secas: el hook mide en un
 * `useLayoutEffect`, y React sólo asigna el ref antes de esa fase cuando el ref
 * viaja en el JSX. Colocarlo a mano después es tarde, y el efecto sale sin
 * hacer nada — un test así pasaría por razones equivocadas.
 */

type Medidas = { scrollWidth?: number; clientWidth?: number }

function fijarMedidas(
  el: HTMLElement,
  { scrollWidth = 776, clientWidth = 232 }: Medidas,
) {
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true })
}

function desplazar(el: HTMLElement, x: number) {
  Object.defineProperty(el, 'scrollLeft', {
    value: x,
    writable: true,
    configurable: true,
  })
  act(() => {
    el.dispatchEvent(new Event('scroll'))
  })
}

/** Monta un carril con un botón activo dentro y devuelve con qué inspeccionarlo. */
function montar(medidas: Medidas = {}) {
  // El componente publica aquí lo último que renderizó, para poder afirmar
  // sobre el estado sin exponer internos del hook.
  const visto = {
    hint: { inicio: false, fin: false },
    traer: (_selector: string) => {},
  }
  const scrollIntoView = vi.fn()

  function Carril() {
    const rail = useScrollRail<HTMLDivElement>()
    visto.hint = rail.hint
    visto.traer = rail.traerALaVista
    return (
      <div ref={rail.ref}>
        <button aria-current="page">Tareas</button>
      </div>
    )
  }

  const { container, unmount } = render(<Carril />)
  const el = container.firstElementChild as HTMLDivElement
  fijarMedidas(el, medidas)
  const activo = el.querySelector('button')!
  activo.scrollIntoView = scrollIntoView
  return { el, visto, scrollIntoView, unmount }
}

describe('useScrollRail', () => {
  it('anuncia contenido a la derecha cuando el carril está al principio', () => {
    const { el, visto } = montar()
    desplazar(el, 0)
    expect(visto.hint).toEqual({ inicio: false, fin: true })
  })

  it('anuncia los dos lados en medio del recorrido', () => {
    const { el, visto } = montar()
    desplazar(el, 272)
    expect(visto.hint).toEqual({ inicio: true, fin: true })
  })

  it('deja de anunciar la derecha al llegar al final', () => {
    const { el, visto } = montar()
    desplazar(el, 776 - 232)
    expect(visto.hint).toEqual({ inicio: true, fin: false })
  })

  /**
   * Los anchos subpíxel dejan restos de fracciones de píxel que no son scroll
   * real. Sin tolerancia, el borde se desvanecería para siempre en un carril
   * que ya está en su tope — y un aviso permanente no avisa de nada.
   */
  it('un resto subpíxel no cuenta como contenido pendiente', () => {
    const { el, visto } = montar()
    desplazar(el, 776 - 232 - 0.6)
    expect(visto.hint.fin).toBe(false)
  })

  it('un carril que no desborda no anuncia nada', () => {
    const { el, visto } = montar({ scrollWidth: 200, clientWidth: 232 })
    desplazar(el, 0)
    expect(visto.hint).toEqual({ inicio: false, fin: false })
  })

  it('trae a la vista sin arrastrar el scroll vertical de la página', () => {
    const { visto, scrollIntoView } = montar()
    act(() => visto.traer('[aria-current="page"]'))
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' })
  })

  it('no revienta si todavía no hay elemento activo', () => {
    const { visto } = montar()
    expect(() => visto.traer('[data-no-existe]')).not.toThrow()
  })

  it('suelta el listener al desmontar', () => {
    const { el, unmount } = montar()
    const quitar = vi.spyOn(el, 'removeEventListener')
    unmount()
    expect(quitar).toHaveBeenCalledWith('scroll', expect.any(Function))
  })
})

describe('useScrollRailWithActive', () => {
  it('reencuadra cada vez que cambia cuál es el activo', () => {
    const scrollIntoView = vi.fn()

    function Carril({ seccion }: { seccion: string }) {
      const rail = useScrollRailWithActive<HTMLDivElement>(seccion)
      return (
        <div ref={rail.ref}>
          <button aria-current="page">{seccion}</button>
        </div>
      )
    }

    const { container, rerender } = render(<Carril seccion="tareas" />)
    const activo = container.querySelector('button')!
    activo.scrollIntoView = scrollIntoView

    const alMontar = scrollIntoView.mock.calls.length
    rerender(<Carril seccion="biblioteca" />)

    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(alMontar)
  })
})
