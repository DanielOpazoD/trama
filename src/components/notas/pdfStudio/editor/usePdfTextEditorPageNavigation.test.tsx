import { act, render, screen } from '@testing-library/react'
import { StrictMode, useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { usePdfTextEditorPageNavigation } from './usePdfTextEditorPageNavigation'

function rect(top: number, height: number): DOMRect {
  return {
    top,
    left: 0,
    width: 400,
    height,
    bottom: top + height,
    right: 400,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect
}

function addPage(container: HTMLElement, index: number, top: number, height = 500) {
  const page = document.createElement('section') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  page.dataset.pdfEditorPage = String(index)
  page.dataset.pdfEditorSheet = String(index)
  page.getBoundingClientRect = () => rect(top - container.scrollTop, height)
  container.append(page)
}

function addDynamicPage(container: HTMLElement, index: number, readRect: () => DOMRect) {
  const page = document.createElement('section') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  page.dataset.pdfEditorPage = String(index)
  page.dataset.pdfEditorSheet = String(index)
  page.getBoundingClientRect = readRect
  container.append(page)
}

function addPageShell(container: HTMLElement, index: number, top: number, height = 500) {
  const page = document.createElement('section') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  page.dataset.pdfEditorPage = String(index)
  page.getBoundingClientRect = () => rect(top - container.scrollTop, height)
  container.append(page)
  return page
}

function makeScrollContainer(): HTMLElement {
  const container = document.createElement('div') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  container.dataset.pdfEditorScroll = ''
  Object.defineProperties(container, {
    clientHeight: { value: 400, configurable: true },
    scrollHeight: { value: 1200, configurable: true },
  })
  container.getBoundingClientRect = () => rect(0, 400)
  return container
}

function TestNavigation({
  initialPage = 0,
  onClear,
  scrollInitialPage = false,
  target,
  total = 3,
}: {
  initialPage?: number
  onClear?: () => void
  scrollInitialPage?: boolean
  target: HTMLElement
  total?: number
}) {
  const [page, setPage] = useState(initialPage)
  const scrollContainerRef = useRef<HTMLElement | null>(target)
  const {
    isInitialPagePositioning,
    scrollInitialPageIntoView,
    syncGeometry,
    syncPageFromScroll,
  } = usePdfTextEditorPageNavigation({
    currentPage: page,
    scrollContainerRef,
    setActivePageLayout: () => onClear?.(),
    setCurrentPage: setPage,
    setEditingId: () => onClear?.(),
    setSelectedId: () => onClear?.(),
    scrollInitialPage,
    total,
  })
  return (
    <>
      <output aria-label="Página actual">{page + 1}</output>
      <output aria-label="Posicionando página inicial">
        {isInitialPagePositioning ? 'sí' : 'no'}
      </output>
      <button type="button" onClick={() => syncPageFromScroll(target)}>
        sync
      </button>
      <button type="button" onClick={() => scrollInitialPageIntoView()}>
        initial
      </button>
      <button type="button" onClick={() => syncGeometry()}>
        geometry
      </button>
    </>
  )
}

/**
 * Mini-motor de layout: una columna de secciones cuyas alturas pueden cambiar
 * después (placeholder → hoja real renderizada). Los tops se derivan de las
 * alturas vigentes, como el flujo del documento real. `settle` marca la hoja
 * como renderizada (aparece su data-pdf-editor-sheet) con su altura real;
 * `inflate` solo cambia la altura (página que re-renderiza más alta).
 */
function makeShiftingLayout(container: HTMLElement, heights: number[]) {
  heights.forEach((_, i) => {
    const section = document.createElement('section') as HTMLElement & {
      getBoundingClientRect: () => DOMRect
    }
    section.dataset.pdfEditorPage = String(i)
    section.getBoundingClientRect = () => {
      const top = heights.slice(0, i).reduce((a, b) => a + b, 0)
      return rect(top - container.scrollTop, heights[i] ?? 0)
    }
    container.append(section)
  })
  return {
    settle(i: number, height: number) {
      heights[i] = height
      const section = container.querySelector<HTMLElement>(
        `[data-pdf-editor-page="${i}"]`,
      )
      if (section) section.dataset.pdfEditorSheet = String(i)
    },
    inflate(i: number, height: number) {
      heights[i] = height
    },
  }
}

describe('usePdfTextEditorPageNavigation', () => {
  it('sincroniza desde el contenedor scrolleable real, no desde el primero del DOM', () => {
    const stale = makeScrollContainer()
    addPage(stale, 0, 0)
    const target = makeScrollContainer()
    addPage(target, 0, -600)
    addPage(target, 1, 40)
    document.body.append(stale, target)

    render(<TestNavigation target={target} />)

    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(screen.getByLabelText('Página actual')).toHaveTextContent('2')
    stale.remove()
    target.remove()
  })

  it('actualizar la página por scroll no limpia selección ni fuerza recálculo de layout', () => {
    const target = makeScrollContainer()
    const onClear = vi.fn()
    addPage(target, 0, -600)
    addPage(target, 1, 40)
    document.body.append(target)

    render(<TestNavigation target={target} onClear={onClear} />)

    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(screen.getByLabelText('Página actual')).toHaveTextContent('2')
    expect(onClear).not.toHaveBeenCalled()
    target.remove()
  })

  it('puede llevar al viewport la página inicial pedida por la miniatura', () => {
    vi.useFakeTimers()
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    addPage(target, 1, 520)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={1} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runAllTimers()
    })

    expect(target.scrollTop).toBe(520)
    vi.useRealTimers()
    target.remove()
  })

  it('lleva la página inicial al contenedor del modal aunque exista otro scroll antes', () => {
    vi.useFakeTimers()
    const stale = makeScrollContainer()
    const target = makeScrollContainer()
    addPage(stale, 0, 0)
    addPage(stale, 1, 520)
    addPage(target, 0, 0)
    addPage(target, 1, 520)
    document.body.append(stale, target)

    render(<TestNavigation target={target} initialPage={1} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runAllTimers()
    })

    expect(stale.scrollTop).toBe(0)
    expect(target.scrollTop).toBe(520)
    vi.useRealTimers()
    stale.remove()
    target.remove()
  })

  it('reintenta el scroll inicial si la página aún no tiene altura estable', () => {
    vi.useFakeTimers()
    let pageReady = false
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    addDynamicPage(target, 1, () =>
      pageReady ? rect(520 - target.scrollTop, 500) : rect(520, 0),
    )
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={1} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runOnlyPendingTimers()
    })
    expect(target.scrollTop).toBe(0)

    pageReady = true
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(target.scrollTop).toBe(520)
    vi.useRealTimers()
    target.remove()
  })

  it('no deja que el scroll visible sobrescriba la página pedida mientras abre', () => {
    vi.useFakeTimers()
    let requestedReady = false
    const target = makeScrollContainer()
    addPage(target, 2, 40)
    addDynamicPage(target, 7, () =>
      requestedReady ? rect(3640 - target.scrollTop, 500) : rect(3640, 0),
    )
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} total={8} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runOnlyPendingTimers()
    })
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')

    requestedReady = true
    act(() => {
      vi.runAllTimers()
    })
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')
    vi.useRealTimers()
    target.remove()
  })

  it('mantiene la página pedida aunque tarde más que la ventana inicial anterior', () => {
    vi.useFakeTimers()
    let requestedReady = false
    const target = makeScrollContainer()
    addPage(target, 2, 40)
    addDynamicPage(target, 7, () =>
      requestedReady ? rect(3640 - target.scrollTop, 500) : rect(3640, 0),
    )
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} total={8} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.advanceTimersByTime(2000)
    })
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')

    requestedReady = true
    act(() => {
      vi.advanceTimersByTime(150)
    })
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })

    expect(target.scrollTop).toBe(3640)
    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')
    vi.useRealTimers()
    target.remove()
  })

  it('acerca la página pedida aunque la hoja renderizada aparezca después', () => {
    vi.useFakeTimers()
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    const delayedPage = addPageShell(target, 7, 3640)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} total={8} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runOnlyPendingTimers()
    })

    expect(target.scrollTop).toBe(3640)
    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')

    delayedPage.dataset.pdfEditorSheet = '7'
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(target.scrollTop).toBe(3640)
    vi.useRealTimers()
    target.remove()
  })

  it('mantiene el scroll inicial bajo StrictMode aunque React limpie el primer timer', () => {
    vi.useFakeTimers()
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    addPage(target, 1, 520)
    document.body.append(target)

    render(
      <StrictMode>
        <TestNavigation target={target} initialPage={1} scrollInitialPage />
      </StrictMode>,
    )

    act(() => {
      vi.runAllTimers()
    })

    expect(target.scrollTop).toBe(520)
    vi.useRealTimers()
    target.remove()
  })

  it('posiciona la página inicial antes de que corran timers visibles', () => {
    vi.useFakeTimers()
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    addPage(target, 7, 3640)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)

    expect(target.scrollTop).toBe(3640)
    vi.useRealTimers()
    target.remove()
  })

  // ——— Matriz de apertura: placeholders que se inflan según el zoom ———
  // El síntoma real: doble clic en la miniatura 8 con zoom alto abría el
  // editor en otra hoja, porque las páginas de arriba eran placeholders que
  // luego se inflaban (sin disparar eventos de scroll). La transición
  // controlada debe terminar SIEMPRE con la hoja 8 centrada y el contador
  // en 8, para cualquier zoom y cualquier orden de llegada de los renders.
  it.each([[0.75], [0.9], [1], [1.25], [1.5]])(
    'primera apertura a página 8 con zoom %s: termina centrada aunque las hojas lleguen tarde y en desorden',
    (zoomFactor) => {
      vi.useFakeTimers()
      const real = Math.round(720 * zoomFactor)
      const heights = Array(8).fill(550) // placeholders (~72vh)
      const target = makeScrollContainer()
      const layout = makeShiftingLayout(target, heights)
      document.body.append(target)

      render(
        <TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />,
      )
      // Mientras nada renderizó, el viewport queda oculto (sin salto visible).
      expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('sí')

      // Los renders llegan en desorden, cada uno cambia la geometría (lo que
      // en el browser dispara el ResizeObserver → acá, syncGeometry).
      for (const i of [3, 0, 5, 1, 6, 2, 4, 7]) {
        act(() => {
          layout.settle(i, real)
          screen.getByRole('button', { name: 'geometry' }).click()
        })
      }
      // La hoja pedida ya está colocada → se revela sin esperar al resto.
      expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('no')
      // El contador NUNCA se movió de la página pedida.
      expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')

      // Dos chequeos estables → liberación con la hoja 8 exactamente centrada.
      act(() => {
        vi.advanceTimersByTime(300)
      })
      expect(target.scrollTop).toBe(7 * real)
      act(() => {
        screen.getByRole('button', { name: 'sync' }).click()
      })
      expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')
      vi.useRealTimers()
      target.remove()
    },
  )

  it('segunda apertura (renders cacheados): no oculta nada y coloca de inmediato', () => {
    vi.useFakeTimers()
    const heights = Array(8).fill(720)
    const target = makeScrollContainer()
    const layout = makeShiftingLayout(target, heights)
    for (let i = 0; i < 8; i += 1) layout.settle(i, 720)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)

    expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('no')
    expect(target.scrollTop).toBe(7 * 720)
    act(() => {
      vi.runAllTimers()
    })
    expect(target.scrollTop).toBe(7 * 720)
    vi.useRealTimers()
    target.remove()
  })

  it('una hoja de ARRIBA que se infla después de liberar no corre lo visible (anclaje manual)', () => {
    vi.useFakeTimers()
    const heights = Array(8).fill(700)
    const target = makeScrollContainer()
    const layout = makeShiftingLayout(target, heights)
    for (let i = 0; i < 8; i += 1) layout.settle(i, 700)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)
    act(() => {
      vi.advanceTimersByTime(300) // estabilidad → liberación + foto base
    })
    expect(target.scrollTop).toBe(7 * 700)

    // Render lento de la página 3 llega tarde y la infla 300px.
    act(() => {
      layout.inflate(2, 1000)
      screen.getByRole('button', { name: 'geometry' }).click()
    })
    // El scroll se compensó por el delta: la hoja 8 sigue siendo la visible.
    expect(target.scrollTop).toBe(7 * 700 + 300)
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })
    expect(screen.getByLabelText('Página actual')).toHaveTextContent('8')
    vi.useRealTimers()
    target.remove()
  })

  it('un gesto del usuario (wheel) suelta el pin de apertura: su intención gana', () => {
    vi.useFakeTimers()
    const heights = Array(8).fill(550)
    const target = makeScrollContainer()
    const layout = makeShiftingLayout(target, heights)
    layout.settle(0, 700)
    layout.settle(1, 700)
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)

    act(() => {
      target.scrollTop = 0
      target.dispatchEvent(new Event('wheel'))
    })
    // El pin se soltó: el sync vuelve a mandar y refleja lo visible.
    act(() => {
      screen.getByRole('button', { name: 'sync' }).click()
    })
    expect(screen.getByLabelText('Página actual')).toHaveTextContent('1')
    vi.useRealTimers()
    target.remove()
  })

  it('válvula de seguridad: si una hoja nunca renderiza, libera por timeout y no queda oculto', () => {
    vi.useFakeTimers()
    const heights = Array(8).fill(550)
    const target = makeScrollContainer()
    makeShiftingLayout(target, heights) // nadie se asienta jamás
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)
    expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('sí')

    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('no')
    // Mejor esfuerzo: quedó sobre la sección pedida (placeholder) igualmente.
    expect(target.scrollTop).toBe(7 * 550)
    vi.useRealTimers()
    target.remove()
  })

  it('mantiene oculta la apertura inicial hasta que la hoja pedida esté estable', () => {
    vi.useFakeTimers()
    let requestedReady = false
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    addDynamicPage(target, 7, () =>
      requestedReady ? rect(3640 - target.scrollTop, 500) : rect(3640, 0),
    )
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={7} scrollInitialPage total={8} />)

    expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('sí')

    requestedReady = true
    act(() => {
      vi.advanceTimersByTime(150)
    })

    expect(screen.getByLabelText('Posicionando página inicial')).toHaveTextContent('no')
    vi.useRealTimers()
    target.remove()
  })
})
