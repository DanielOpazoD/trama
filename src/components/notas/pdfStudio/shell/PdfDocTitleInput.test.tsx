import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PdfDocTitleInput } from './PdfDocTitleInput'

describe('<PdfDocTitleInput />', () => {
  it('confirma al salir del campo (no en cada tecla)', () => {
    const onCommit = vi.fn()
    render(<PdfDocTitleInput title="" onCommit={onCommit} />)
    const input = screen.getByLabelText('Título del documento')
    fireEvent.change(input, { target: { value: 'Ensayo memoria' } })
    expect(onCommit).not.toHaveBeenCalled()
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledWith('Ensayo memoria')
  })

  it('Escape restaura el título previo sin confirmar el borrador', () => {
    const onCommit = vi.fn()
    render(<PdfDocTitleInput title="Original" onCommit={onCommit} />)
    const input = screen.getByLabelText('Título del documento') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Cambiado' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('Original')
  })

  it('se resincroniza cuando el doc cambia por fuera', () => {
    const { rerender } = render(<PdfDocTitleInput title="Uno" onCommit={() => {}} />)
    rerender(<PdfDocTitleInput title="Otro" onCommit={() => {}} />)
    const input = screen.getByLabelText('Título del documento') as HTMLInputElement
    expect(input.value).toBe('Otro')
  })
})
