/**
 * PR4 — RenameModal: foco+selección al abrir, validación de no-vacío,
 * preservación de extensión y confirmación con Enter / cancelación con Escape.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { RenameModal } from './RenameModal'
import * as apiModule from '../../api'
import type { LibraryItem } from '../../types/biblioteca'

function item(partial: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:a1',
    kind: 'notas-attachment',
    itemId: 'a1',
    title: 'Contrato.pdf',
    fileType: 'pdf',
    source: 'subido',
    mimeType: 'application/pdf',
    byteSize: 1024,
    storageKey: 'legacy/a1',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

afterEach(() => vi.restoreAllMocks())

describe('<RenameModal />', () => {
  it('prellena el input con el título actual', () => {
    renderWithProviders(<RenameModal item={item()} open onClose={() => {}} />)
    const input = screen.getByLabelText('Nombre') as HTMLInputElement
    expect(input.value).toBe('Contrato.pdf')
  })

  it('muestra error inline al confirmar con nombre vacío y no llama a la API', () => {
    const renameSpy = vi
      .spyOn(apiModule.api.biblioteca, 'rename')
      .mockResolvedValue(undefined)
    renderWithProviders(<RenameModal item={item()} open onClose={() => {}} />)
    const input = screen.getByLabelText('Nombre')
    fireEvent.change(input, { target: { value: '   ' } })
    // El botón queda deshabilitado con input vacío; Enter dispara la validación
    // y revela el error inline.
    expect(screen.getByRole('button', { name: 'Renombrar' })).toBeDisabled()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('El nombre no puede estar vacío')).toBeInTheDocument()
    expect(renameSpy).not.toHaveBeenCalled()
  })

  it('preserva la extensión si el usuario la quitó (Enter confirma)', async () => {
    const renameSpy = vi
      .spyOn(apiModule.api.biblioteca, 'rename')
      .mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderWithProviders(<RenameModal item={item()} open onClose={onClose} />)
    const input = screen.getByLabelText('Nombre')
    fireEvent.change(input, { target: { value: 'Contrato firmado' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() =>
      expect(renameSpy).toHaveBeenCalledWith(
        'notas-attachment',
        'a1',
        'Contrato firmado.pdf',
      ),
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape cancela sin renombrar', () => {
    const renameSpy = vi
      .spyOn(apiModule.api.biblioteca, 'rename')
      .mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderWithProviders(<RenameModal item={item()} open onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(renameSpy).not.toHaveBeenCalled()
  })

  it('sin cambios reales cierra sin tocar la API', () => {
    const renameSpy = vi
      .spyOn(apiModule.api.biblioteca, 'rename')
      .mockResolvedValue(undefined)
    const onClose = vi.fn()
    renderWithProviders(<RenameModal item={item()} open onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Renombrar' }))
    expect(renameSpy).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
