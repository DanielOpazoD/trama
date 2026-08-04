import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CaptureItem, Recorte } from '../../api'
import { useNotasFeedSelection } from './useNotasFeedSelection'
import type { NotasFeedSegment } from './notasFeedViewModel'
import type { RecorteFeedView } from '../../hooks/useRecorteFeedView'

const recorte = (id: string): Recorte => ({
  captureMode: 'image',
  capturedAt: null,
  captureSource: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  id,
  imageKey: null,
  imageUrl: null,
  images: [],
  note: null,
  promotedId: null,
  promotedTarget: null,
  sourceAuthor: null,
  sourceTitle: null,
  sourceUrl: null,
  status: 'pending',
  text: `recorte ${id}`,
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const item = (id: string): CaptureItem => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  id,
  recorte: recorte(id),
  type: 'recorte',
})

function renderSelection({
  feedView = 'list',
  segment = 'capturas',
}: {
  feedView?: RecorteFeedView
  segment?: NotasFeedSegment
} = {}) {
  return renderHook(
    ({ currentFeedView, currentSegment }) =>
      useNotasFeedSelection({
        feedView: currentFeedView,
        items: [item('a'), item('b')],
        segment: currentSegment,
      }),
    {
      initialProps: {
        currentFeedView: feedView,
        currentSegment: segment,
      },
    },
  )
}

describe('useNotasFeedSelection', () => {
  it('la seleccion tambien vale en los segmentos de notas, en orden del feed', () => {
    // Antes canSelect exigia segment==='capturas'; ahora escritas/todo
    // seleccionan para enviar fotos de notas a Imprenta.
    const hook = renderSelection({ segment: 'todo' })

    act(() => hook.result.current.toggleSelectionMode())
    expect(hook.result.current.selectionMode).toBe(true)

    // Selecciono b y luego a: selectedItems respeta el orden del FEED (a, b),
    // no el de los clics — Imprenta agrupa imagenes consecutivas en hojas.
    act(() => {
      hook.result.current.toggleSelect('b')
      hook.result.current.toggleSelect('a')
    })
    expect(hook.result.current.selectedItems.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('activa, selecciona y limpia seleccion desde el toggle publico', () => {
    const hook = renderSelection()

    act(() => hook.result.current.toggleSelectionMode())
    expect(hook.result.current.selectionMode).toBe(true)

    act(() => hook.result.current.toggleSelect('a'))
    expect([...hook.result.current.selectedIds]).toEqual(['a'])
    expect(hook.result.current.selectedRecortes.map((r) => r.id)).toEqual(['a'])

    act(() => hook.result.current.toggleSelectionMode())
    expect(hook.result.current.selectionMode).toBe(false)
    expect([...hook.result.current.selectedIds]).toEqual([])
  })

  it('devuelve seleccion efectiva vacia al salir de capturas sin esperar al efecto', () => {
    const hook = renderSelection()

    act(() => {
      hook.result.current.toggleSelectionMode()
      hook.result.current.toggleSelect('a')
    })
    hook.rerender({ currentFeedView: 'list', currentSegment: 'todo' })

    expect(hook.result.current.selectionMode).toBe(false)
    expect([...hook.result.current.selectedIds]).toEqual([])
    expect(hook.result.current.selectedRecortes).toEqual([])
  })

  it('sale de seleccion al pasar a galeria y bloquea nuevos toggles', () => {
    const hook = renderSelection()

    act(() => {
      hook.result.current.toggleSelectionMode()
      hook.result.current.toggleSelect('a')
    })
    hook.rerender({ currentFeedView: 'galeria', currentSegment: 'capturas' })

    expect(hook.result.current.galleryMode).toBe(true)
    expect(hook.result.current.selectionMode).toBe(false)
    expect([...hook.result.current.selectedIds]).toEqual([])

    act(() => {
      hook.result.current.toggleSelectionMode()
      hook.result.current.toggleSelect('b')
    })
    expect(hook.result.current.selectionMode).toBe(false)
    expect([...hook.result.current.selectedIds]).toEqual([])
  })
})
