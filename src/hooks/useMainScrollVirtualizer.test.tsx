import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useMainScrollVirtualizer } from './useMainScrollVirtualizer'

/**
 * Smoke test del wrapper sobre TanStack Virtual. No testeamos la
 * virtualización en sí (eso es responsabilidad de la lib upstream);
 * solo el contrato del hook: que devuelve `listRef` mutable y
 * `virtualizer` con la API mínima usada por los call sites
 * (getTotalSize, getVirtualItems, measureElement).
 *
 * El scroll container `#main-scroll` se setea en App.tsx; en tests
 * lo creamos manualmente para que el `useLayoutEffect` interno no
 * rompa por null.
 */

beforeEach(() => {
  const el = document.createElement('div')
  el.id = 'main-scroll'
  document.body.appendChild(el)
})

afterEach(() => {
  document.getElementById('main-scroll')?.remove()
})

describe('useMainScrollVirtualizer', () => {
  it('devuelve listRef + virtualizer con la API esperada', () => {
    const { result } = renderHook(() =>
      useMainScrollVirtualizer({ count: 10, estimateSize: 100 }),
    )
    expect(result.current.listRef).toHaveProperty('current')
    expect(result.current.virtualizer).toBeDefined()
    expect(typeof result.current.virtualizer.getTotalSize).toBe('function')
    expect(typeof result.current.virtualizer.getVirtualItems).toBe('function')
    expect(typeof result.current.virtualizer.measureElement).toBe('function')
  })

  it('count=0 produce una lista vacía de items virtuales', () => {
    const { result } = renderHook(() =>
      useMainScrollVirtualizer({ count: 0, estimateSize: 100 }),
    )
    expect(result.current.virtualizer.getVirtualItems()).toEqual([])
    expect(result.current.virtualizer.getTotalSize()).toBe(0)
  })

  it('estimateSize como número y como función ambos compilan', () => {
    const { result: numericResult } = renderHook(() =>
      useMainScrollVirtualizer({ count: 5, estimateSize: 80 }),
    )
    expect(numericResult.current.virtualizer.getTotalSize()).toBeGreaterThan(0)

    const { result: fnResult } = renderHook(() =>
      useMainScrollVirtualizer({
        count: 5,
        estimateSize: (index) => 80 + index * 5,
      }),
    )
    expect(fnResult.current.virtualizer.getTotalSize()).toBeGreaterThan(0)
  })

  it('overscan customizable; default 6', () => {
    // No podemos chequear directamente overscan sin renderear; solo
    // verificamos que el hook acepta el prop sin tirar.
    expect(() =>
      renderHook(() =>
        useMainScrollVirtualizer({ count: 5, estimateSize: 100, overscan: 12 }),
      ),
    ).not.toThrow()
  })
})
