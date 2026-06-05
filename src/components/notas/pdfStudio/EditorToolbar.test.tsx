import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EditorToolbar } from './EditorToolbar'
import { type TextStyle } from './editorStyle'

type Props = Parameters<typeof EditorToolbar>[0]

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    tool: 'select',
    onToolChange: vi.fn(),
    onAddText: vi.fn(),
    activeFont: 'sans',
    activeSize: 0.04,
    activeBold: false,
    activeColor: '#222222',
    activeOpacity: 1,
    activeRotation: 0,
    onApplyStyle: vi.fn(),
    hasTextSelected: false,
    onDuplicate: vi.fn(),
    hasSelection: false,
    onDelete: vi.fn(),
    zoom: 1.5,
    onZoomChange: vi.fn(),
    ...overrides,
  }
  render(<EditorToolbar {...props} />)
  return props
}

/** Último patch pasado a onApplyStyle. */
const lastStyle = (fn: Props['onApplyStyle']): Partial<TextStyle> => {
  const calls = vi.mocked(fn).mock.calls
  return calls[calls.length - 1]![0]
}

describe('<EditorToolbar />', () => {
  it('agrega texto y cambia de herramienta', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Agregar texto'))
    expect(p.onAddText).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('Herramienta resaltar'))
    expect(p.onToolChange).toHaveBeenCalledWith('highlight')
  })

  it('aplica fuente, negrita y color por onApplyStyle', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Serif'))
    expect(lastStyle(p.onApplyStyle)).toEqual({ font: 'serif' })
    fireEvent.click(screen.getByLabelText('Negrita'))
    expect(lastStyle(p.onApplyStyle)).toEqual({ bold: true })
    fireEvent.click(screen.getByLabelText('Color Rojo'))
    expect(lastStyle(p.onApplyStyle)).toEqual({ color: '#b3412c' })
  })

  it('el stepper de tamaño aplica un sizeRatio mayor', () => {
    const p = setup({ activeSize: 0.04 })
    fireEvent.click(screen.getByLabelText('Tamaño de letra: aumentar'))
    expect(lastStyle(p.onApplyStyle).sizeRatio).toBeGreaterThan(0.04)
  })

  it('deshabilita aumentar tamaño en el máximo', () => {
    setup({ activeSize: 0.14 })
    expect(screen.getByLabelText('Tamaño de letra: aumentar')).toBeDisabled()
  })

  it('el zoom sube y se restablece al tocar el valor', () => {
    const p = setup({ zoom: 1.5 })
    fireEvent.click(screen.getByLabelText('Zoom del documento: aumentar'))
    expect(p.onZoomChange).toHaveBeenLastCalledWith(1.75)
    fireEvent.click(screen.getByText('150%'))
    expect(p.onZoomChange).toHaveBeenLastCalledWith(1)
  })

  it('oculta Duplicar/Eliminar cuando no hay selección', () => {
    setup({ hasTextSelected: false, hasSelection: false })
    expect(screen.queryByLabelText('Duplicar texto')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Eliminar')).not.toBeInTheDocument()
  })

  it('Duplicar (texto) y Eliminar (cualquier selección) disparan sus handlers', () => {
    const p = setup({ hasTextSelected: true, hasSelection: true })
    fireEvent.click(screen.getByLabelText('Duplicar texto'))
    expect(p.onDuplicate).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByLabelText('Eliminar'))
    expect(p.onDelete).toHaveBeenCalledOnce()
  })
})
