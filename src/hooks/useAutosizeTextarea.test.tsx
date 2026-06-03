import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import { useAutosizeTextarea } from './useAutosizeTextarea'

// happy-dom no hace layout real: controlamos scrollHeight/clientWidth con getters
// en el prototipo, y stubeamos ResizeObserver para disparar su callback a mano.
let mockScrollHeight = 0
let mockClientWidth = 300
let roCallbacks: Array<() => void> = []

beforeEach(() => {
  mockScrollHeight = 0
  mockClientWidth = 300
  roCallbacks = []
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => mockScrollHeight,
  })
  Object.defineProperty(HTMLTextAreaElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => mockClientWidth,
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        roCallbacks.push(cb)
      }
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'scrollHeight')
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'clientWidth')
  vi.unstubAllGlobals()
})

function Probe({ value }: { value: string }) {
  const ref = useAutosizeTextarea(value, { minRows: 2, maxRows: 10 })
  return <textarea ref={ref} value={value} readOnly data-testid="ta" />
}

describe('useAutosizeTextarea', () => {
  it('clampa al mínimo, deja pasar el rango medio y clampa al máximo', () => {
    // Contenido diminuto → sube al mínimo, sin scroll.
    mockScrollHeight = 10
    const { getByTestId, rerender } = render(<Probe value="a" />)
    const ta = getByTestId('ta') as HTMLTextAreaElement
    const minH = parseInt(ta.style.height, 10)
    expect(minH).toBeGreaterThan(10)
    expect(ta.style.overflowY).toBe('hidden')

    // Rango medio → la altura sigue al contenido exactamente.
    mockScrollHeight = 100
    rerender(<Probe value="ab" />)
    expect(ta.style.height).toBe('100px')
    expect(ta.style.overflowY).toBe('hidden')

    // Contenido enorme → clampa al máximo y aparece scroll.
    mockScrollHeight = 500
    rerender(<Probe value="abc" />)
    const maxH = parseInt(ta.style.height, 10)
    expect(maxH).toBeLessThan(500)
    expect(maxH).toBeGreaterThan(100)
    expect(ta.style.overflowY).toBe('auto')
  })

  it('recalcula al cambiar el ancho, pero ignora cambios de solo alto', () => {
    mockScrollHeight = 100
    const { getByTestId } = render(<Probe value="a" />)
    const ta = getByTestId('ta') as HTMLTextAreaElement
    expect(ta.style.height).toBe('100px')
    expect(roCallbacks.length).toBeGreaterThan(0)
    const fire = roCallbacks[roCallbacks.length - 1]!

    // Mismo ancho (cambio de alto propio) → el guard ignora, sin re-medir.
    mockScrollHeight = 500
    fire()
    expect(ta.style.height).toBe('100px')

    // Cambió el ancho → re-mide (ahora con scrollHeight 500 → clampa al máximo).
    mockClientWidth = 520
    fire()
    expect(ta.style.height).not.toBe('100px')
    expect(ta.style.overflowY).toBe('auto')
  })
})
