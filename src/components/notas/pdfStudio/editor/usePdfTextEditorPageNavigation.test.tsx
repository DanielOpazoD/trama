import { act, render, screen } from '@testing-library/react'
import { useState } from 'react'
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
  page.getBoundingClientRect = () => rect(top - container.scrollTop, height)
  container.append(page)
}

function addDynamicPage(container: HTMLElement, index: number, readRect: () => DOMRect) {
  const page = document.createElement('section') as HTMLElement & {
    getBoundingClientRect: () => DOMRect
  }
  page.dataset.pdfEditorPage = String(index)
  page.getBoundingClientRect = readRect
  container.append(page)
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
  target,
}: {
  initialPage?: number
  onClear?: () => void
  target: HTMLElement
}) {
  const [page, setPage] = useState(initialPage)
  const { scrollInitialPageIntoView, syncPageFromScroll } =
    usePdfTextEditorPageNavigation({
      currentPage: page,
      setActivePageLayout: () => onClear?.(),
      setCurrentPage: setPage,
      setEditingId: () => onClear?.(),
      setSelectedId: () => onClear?.(),
      total: 3,
    })
  return (
    <>
      <output aria-label="Página actual">{page + 1}</output>
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

  it('mantiene el scroll inicial durante los cambios de layout de la página destino', () => {
    vi.useFakeTimers()
    const target = makeScrollContainer()
    addPage(target, 0, 0)
    let top = 520
    addDynamicPage(target, 1, () => rect(top - target.scrollTop, 500))
    document.body.append(target)

    render(<TestNavigation target={target} initialPage={1} />)

    act(() => {
      screen.getByRole('button', { name: 'initial' }).click()
      vi.runOnlyPendingTimers()
    })
    expect(target.scrollTop).toBe(520)

    top = 1320
    act(() => {
      vi.runOnlyPendingTimers()
    })

    expect(target.scrollTop).toBe(1320)
    vi.useRealTimers()
    target.remove()
  })
})
