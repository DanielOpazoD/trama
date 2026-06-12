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
  const { isInitialPagePositioning, scrollInitialPageIntoView, syncPageFromScroll } =
    usePdfTextEditorPageNavigation({
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
    </>
  )
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
