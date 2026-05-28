import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useGraphKeyboardNav } from './useGraphKeyboardNav'
import type { Entity } from '../types'

// Mínimo viable para un Entity — el hook solo lee .id, no le importa
// el resto del shape.
function ent(id: string): Entity {
  return {
    id,
    name: id,
    type: 'persona',
    description: null,
    year: null,
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    origin: { kind: 'manual' },
  } as unknown as Entity
}

function makeEvent(key: string, opts: { shiftKey?: boolean } = {}) {
  const ev = {
    key,
    shiftKey: opts.shiftKey ?? false,
    preventDefault: vi.fn(),
  }
  return ev as unknown as React.KeyboardEvent
}

describe('useGraphKeyboardNav', () => {
  it('focusedIndex arranca en -1', () => {
    const entities = [ent('a'), ent('b'), ent('c')]
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect: () => {} }),
    )
    expect(result.current.focusedIndex).toBe(-1)
  })

  it('ArrowRight avanza al siguiente nodo (wrap al final)', () => {
    const entities = [ent('a'), ent('b'), ent('c')]
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect: () => {} }),
    )
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    expect(result.current.focusedIndex).toBe(0)
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    expect(result.current.focusedIndex).toBe(1)
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    expect(result.current.focusedIndex).toBe(2)
    // Wrap: 3 → 0
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('ArrowLeft retrocede (wrap al final desde -1)', () => {
    const entities = [ent('a'), ent('b'), ent('c')]
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect: () => {} }),
    )
    // -1 → 2 (wrap)
    act(() => result.current.onKeyDown(makeEvent('ArrowLeft')))
    expect(result.current.focusedIndex).toBe(2)
    act(() => result.current.onKeyDown(makeEvent('ArrowLeft')))
    expect(result.current.focusedIndex).toBe(1)
  })

  it('Tab navega adelante (sin shift); shift+Tab no es manejado por el hook', () => {
    const entities = [ent('a'), ent('b')]
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect: () => {} }),
    )
    const tabEvent = makeEvent('Tab')
    act(() => result.current.onKeyDown(tabEvent))
    expect(result.current.focusedIndex).toBe(0)
    expect(tabEvent.preventDefault).toHaveBeenCalled()

    // shift+Tab: el hook no preventDefault y no avanza (deja al browser
    // hacer su navegación de focus normal).
    const shiftTabEvent = makeEvent('Tab', { shiftKey: true })
    act(() => result.current.onKeyDown(shiftTabEvent))
    expect(shiftTabEvent.preventDefault).not.toHaveBeenCalled()
    expect(result.current.focusedIndex).toBe(0) // sin cambio
  })

  it('Enter dispara onSelect con el id del nodo enfocado', () => {
    const entities = [ent('a'), ent('b')]
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect }),
    )
    act(() => result.current.onKeyDown(makeEvent('ArrowRight'))) // index 0
    act(() => result.current.onKeyDown(makeEvent('Enter')))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('Enter sobre el ya seleccionado deselecciona (toggle)', () => {
    const entities = [ent('a'), ent('b')]
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: 'a', onSelect }),
    )
    act(() => result.current.onKeyDown(makeEvent('ArrowRight'))) // focused = 0 → 'a'
    act(() => result.current.onKeyDown(makeEvent('Enter')))
    expect(onSelect).toHaveBeenCalledWith(null)
  })

  it('Espacio se comporta igual que Enter', () => {
    const entities = [ent('a')]
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: null, onSelect }),
    )
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    act(() => result.current.onKeyDown(makeEvent(' ')))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('Escape deselecciona y resetea focusedIndex a -1', () => {
    const entities = [ent('a'), ent('b')]
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities, selectedId: 'a', onSelect }),
    )
    act(() => result.current.onKeyDown(makeEvent('ArrowRight')))
    expect(result.current.focusedIndex).toBe(0)
    act(() => result.current.onKeyDown(makeEvent('Escape')))
    expect(onSelect).toHaveBeenCalledWith(null)
    expect(result.current.focusedIndex).toBe(-1)
  })

  it('si entities está vacío, no responde a ningún input', () => {
    const onSelect = vi.fn()
    const { result } = renderHook(() =>
      useGraphKeyboardNav({ entities: [], selectedId: null, onSelect }),
    )
    const ev = makeEvent('ArrowRight')
    act(() => result.current.onKeyDown(ev))
    expect(result.current.focusedIndex).toBe(-1)
    expect(ev.preventDefault).not.toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('si entities.length baja por debajo del focusedIndex, resetea a -1', () => {
    let entities = [ent('a'), ent('b'), ent('c')]
    const { result, rerender } = renderHook(
      ({ entities }: { entities: Entity[] }) =>
        useGraphKeyboardNav({ entities, selectedId: null, onSelect: () => {} }),
      { initialProps: { entities } },
    )
    act(() => {
      result.current.onKeyDown(makeEvent('ArrowRight'))
      result.current.onKeyDown(makeEvent('ArrowRight'))
      result.current.onKeyDown(makeEvent('ArrowRight'))
    })
    expect(result.current.focusedIndex).toBe(2)
    // Borramos el 'c' → length 2. focusedIndex (2) queda fuera de rango.
    entities = [ent('a'), ent('b')]
    rerender({ entities })
    expect(result.current.focusedIndex).toBe(-1)
  })
})
