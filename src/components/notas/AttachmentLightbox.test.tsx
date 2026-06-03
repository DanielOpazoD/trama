import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// La media autenticada baja un blob por la red: la neutralizamos para que la
// imagen esté "lista" sin tocar fetch.
vi.mock('../momentos/AuthenticatedMedia', () => ({
  useAuthenticatedMediaState: () => ({ src: 'blob:x', status: 'ready' }),
}))

import { AttachmentLightbox } from './AttachmentLightbox'
import type { NotasAttachment } from '../../api'

const photos = [
  { id: 'a', fileName: 'uno.jpg', url: '/api/notas-attachments-file/a' },
  { id: 'b', fileName: 'dos.jpg', url: '/api/notas-attachments-file/b' },
  { id: 'c', fileName: 'tres.jpg', url: '/api/notas-attachments-file/c' },
] as unknown as NotasAttachment[]

function setup(overrides: Record<string, unknown> = {}) {
  const props = {
    photos,
    index: 0,
    onIndexChange: vi.fn(),
    onClose: vi.fn(),
    onEdit: vi.fn(),
    editing: false,
    interactive: true,
    ...overrides,
  }
  render(<AttachmentLightbox {...(props as Parameters<typeof AttachmentLightbox>[0])} />)
  return props
}

describe('<AttachmentLightbox />', () => {
  afterEach(() => vi.restoreAllMocks())

  it('muestra contador, imagen y controles', () => {
    setup()
    expect(screen.getByRole('dialog', { name: /visor de fotos/i })).toBeInTheDocument()
    expect(screen.getByText(/1 \/ 3/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'uno.jpg' })).toBeInTheDocument()
  })

  it('las flechas navegan con wrap', () => {
    const { onIndexChange } = setup({ index: 0 })
    fireEvent.click(screen.getByRole('button', { name: /foto anterior/i }))
    expect(onIndexChange).toHaveBeenCalledWith(2) // wrap al final
    fireEvent.click(screen.getByRole('button', { name: /foto siguiente/i }))
    expect(onIndexChange).toHaveBeenCalledWith(1)
  })

  it('el teclado navega y cierra cuando es interactivo', () => {
    const { onIndexChange, onClose } = setup({ index: 1 })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(2)
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenCalledWith(0)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('ignora el teclado cuando interactive=false (editor encima)', () => {
    const { onIndexChange, onClose } = setup({ interactive: false })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onIndexChange).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('editar dispara onEdit; cerrar dispara onClose', () => {
    const { onEdit, onClose } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^editar foto$/i }))
    expect(onEdit).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: /^cerrar$/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
