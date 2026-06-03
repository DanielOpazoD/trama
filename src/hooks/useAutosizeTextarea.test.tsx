import { afterEach, beforeEach, describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { useAutosizeTextarea } from './useAutosizeTextarea'

// happy-dom no hace layout real (scrollHeight = 0): lo controlamos con un getter
// en el prototipo para ejercitar las ramas de clamp min/max.
let mockScrollHeight = 0
beforeEach(() => {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => mockScrollHeight,
  })
})
afterEach(() => {
  Reflect.deleteProperty(HTMLTextAreaElement.prototype, 'scrollHeight')
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
})
