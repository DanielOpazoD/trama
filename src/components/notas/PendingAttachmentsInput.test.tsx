import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { PendingAttachmentChips } from './PendingAttachmentsInput'

describe('<PendingAttachmentChips />', () => {
  it('muestra anexos pendientes con tama\u00f1os legibles y permite quitar uno', () => {
    const onChange = vi.fn()
    const files = [
      new File(['a'.repeat(900)], 'tiny.txt', { type: 'text/plain' }),
      new File(['a'.repeat(24 * 1024)], 'brief.pdf', { type: 'application/pdf' }),
      new File(['a'.repeat(Math.round(2.5 * 1024 * 1024))], 'deck.zip', {
        type: 'application/zip',
      }),
    ]

    render(<PendingAttachmentChips files={files} onChange={onChange} />)

    expect(screen.getByText('tiny.txt')).toBeInTheDocument()
    expect(screen.getByText('900 B')).toBeInTheDocument()
    expect(screen.getByText('24 KB')).toBeInTheDocument()
    expect(screen.getByText('2.5 MB')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar anexo brief.pdf' }))

    expect(onChange).toHaveBeenCalledWith([files[0], files[2]])
  })

  it('sin archivos no dibuja nada; ocupado deshabilita el quitar', () => {
    const { container } = render(<PendingAttachmentChips files={[]} onChange={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()

    const onChange = vi.fn()
    render(
      <PendingAttachmentChips
        files={[new File(['x'], 'x.txt', { type: 'text/plain' })]}
        onChange={onChange}
        busy
      />,
    )
    const remove = screen.getByRole('button', { name: 'Quitar anexo x.txt' })
    expect(remove).toBeDisabled()
    fireEvent.click(remove)
    expect(onChange).not.toHaveBeenCalled()
  })
})
