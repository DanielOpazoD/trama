import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { usePageSelection } from './usePageSelection'
import { addImageSource, emptyDoc, type PdfPage } from '../../../lib/pdfStudio/model'

/** 4 páginas (imágenes) con ids estables para mapear índice↔id. */
function fourPages(): PdfPage[] {
  let d = emptyDoc()
  for (const n of ['a', 'b', 'c', 'd']) {
    d = addImageSource(d, new File(['x'], `${n}.png`, { type: 'image/png' }))
  }
  return d.pages
}

describe('usePageSelection', () => {
  it('arranca vacío', () => {
    const pages = fourPages()
    const { result } = renderHook(() => usePageSelection(pages))
    expect(result.current.selectedCount).toBe(0)
    expect(result.current.selectedIndices).toEqual([])
  })

  it('toggle selecciona y deselecciona la misma página', () => {
    const pages = fourPages()
    const { result } = renderHook(() => usePageSelection(pages))
    act(() => result.current.toggleSelect(1, false))
    expect(result.current.selectedIndices).toEqual([1])
    act(() => result.current.toggleSelect(1, false))
    expect(result.current.selectedCount).toBe(0)
  })

  it('Shift extiende el rango desde el ancla (último clic)', () => {
    const pages = fourPages()
    const { result } = renderHook(() => usePageSelection(pages))
    act(() => result.current.toggleSelect(1, false))
    act(() => result.current.toggleSelect(3, true))
    expect(result.current.selectedIndices).toEqual([1, 2, 3])
  })

  it('selectedIndices va en orden de documento, no de selección', () => {
    const pages = fourPages()
    const { result } = renderHook(() => usePageSelection(pages))
    act(() => result.current.toggleSelect(3, false))
    act(() => result.current.toggleSelect(0, false))
    expect(result.current.selectedIndices).toEqual([0, 3])
  })

  it('selectAll marca todas y clearSelection las suelta', () => {
    const pages = fourPages()
    const { result } = renderHook(() => usePageSelection(pages))
    act(() => result.current.selectAll())
    expect(result.current.selectedCount).toBe(4)
    act(() => result.current.clearSelection())
    expect(result.current.selectedCount).toBe(0)
  })

  it('la selección es por ID (sobrevive al reordenar las páginas)', () => {
    const pages = fourPages()
    const { result, rerender } = renderHook(({ p }) => usePageSelection(p), {
      initialProps: { p: pages },
    })
    act(() => result.current.toggleSelect(0, false))
    const selectedId = pages[0]!.id
    // Reordenamos: la página 0 pasa al final.
    const reordered = [pages[1]!, pages[2]!, pages[3]!, pages[0]!]
    rerender({ p: reordered })
    // Sigue seleccionada, ahora en el índice 3.
    expect(result.current.selectedIds.has(selectedId)).toBe(true)
    expect(result.current.selectedIndices).toEqual([3])
  })
})
