import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ZoomPercentInput, zoomPercentToScale } from './ZoomPercentInput'

describe('ZoomPercentInput', () => {
  it('parsea porcentajes manuales y los acota al rango permitido', () => {
    expect(zoomPercentToScale('125')).toBe(1.25)
    expect(zoomPercentToScale('125%')).toBe(1.25)
    expect(zoomPercentToScale('87,5')).toBe(0.88)
    expect(zoomPercentToScale('10')).toBe(0.5)
    expect(zoomPercentToScale('999')).toBe(2.1)
    expect(zoomPercentToScale('texto')).toBeNull()
  })

  it('aplica el zoom escrito al salir del input', () => {
    const onZoomChange = vi.fn()
    render(<ZoomPercentInput zoom={1.5} onZoomChange={onZoomChange} />)

    const input = screen.getByLabelText('Porcentaje de zoom')
    fireEvent.change(input, { target: { value: '110' } })
    fireEvent.blur(input)

    expect(onZoomChange).toHaveBeenCalledWith(1.1)
  })
})
