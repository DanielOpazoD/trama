import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PendingAttachmentsInput } from './PendingAttachmentsInput'

describe('<PendingAttachmentsInput />', () => {
  it('muestra anexos pendientes con tamaños legibles y permite quitar uno', () => {
    const onChange = vi.fn()
    const files = [
      new File(['a'.repeat(900)], 'tiny.txt', { type: 'text/plain' }),
      new File(['a'.repeat(24 * 1024)], 'brief.pdf', { type: 'application/pdf' }),
      new File(['a'.repeat(Math.round(2.5 * 1024 * 1024))], 'deck.zip', {
        type: 'application/zip',
      }),
    ]

    render(<PendingAttachmentsInput files={files} onChange={onChange} />)

    expect(screen.getByText('tiny.txt')).toBeInTheDocument()
    expect(screen.getByText('900 B')).toBeInTheDocument()
    expect(screen.getByText('24 KB')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar anexo pendiente' })[1]!)

    expect(onChange).toHaveBeenCalledWith([files[0], files[2]])
  })

  it('agrega varios archivos y limpia el input', () => {
    const onChange = vi.fn()
    const existing = new File(['uno'], 'uno.md', { type: 'text/markdown' })
    const added = [
      new File(['dos'], 'dos.txt', { type: 'text/plain' }),
      new File(['tres'], 'tres.txt', { type: 'text/plain' }),
    ]

    render(<PendingAttachmentsInput files={[existing]} onChange={onChange} />)

    const input = screen.getByLabelText('adjuntar archivo') as HTMLInputElement
    fireEvent.change(input, { target: { files: added } })

    expect(onChange).toHaveBeenCalledWith([existing, ...added])
    expect(input.value).toBe('')
  })

  it('no agrega archivos mientras está ocupado', () => {
    const onChange = vi.fn()
    render(<PendingAttachmentsInput files={[]} onChange={onChange} busy />)

    const input = screen.getByLabelText('adjuntar archivo') as HTMLInputElement
    fireEvent.change(input, {
      target: {
        files: [new File(['bloqueado'], 'bloqueado.txt', { type: 'text/plain' })],
      },
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(input).toBeDisabled()
  })
})
