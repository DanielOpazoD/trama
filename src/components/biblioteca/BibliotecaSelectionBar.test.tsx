import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '../../test-utils'
import { BibliotecaSelectionBar } from './BibliotecaSelectionBar'
import { ToastHost } from '../ToastHost'
import type { LibraryItem } from '../../types/biblioteca'

const apiMocks = vi.hoisted(() => ({ setDeleted: vi.fn() }))
const requestMocks = vi.hoisted(() => ({ requestBlob: vi.fn() }))

vi.mock('../../api', () => ({ api: { biblioteca: apiMocks } }))
vi.mock('../../api/request', () => ({ requestBlob: requestMocks.requestBlob }))

function item(partial: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: 'notas-attachment:1',
    kind: 'notas-attachment',
    itemId: '1',
    title: 'foto.png',
    fileType: 'image',
    source: 'subido',
    mimeType: 'image/png',
    byteSize: 1024,
    storageKey: 'user/foto.png',
    storageDomain: 'notas-attachments',
    tags: [],
    pinned: false,
    aiStatus: null,
    createdAt: '2026-06-20T10:00:00.000Z',
    updatedAt: '2026-06-20T10:00:00.000Z',
    ...partial,
  }
}

describe('<BibliotecaSelectionBar />', () => {
  beforeEach(() => {
    apiMocks.setDeleted.mockReset().mockResolvedValue(undefined)
    requestMocks.requestBlob
      .mockReset()
      .mockResolvedValue(new Blob(['x'], { type: 'image/png' }))
  })

  it('no renderiza nada sin selección', () => {
    const { container } = renderWithProviders(
      <BibliotecaSelectionBar selected={[]} onClear={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('muestra el conteo en plural/singular', () => {
    const { rerender } = renderWithProviders(
      <BibliotecaSelectionBar selected={[item()]} onClear={vi.fn()} />,
    )
    expect(screen.getByText('1 seleccionado')).toBeInTheDocument()
    rerender(
      <BibliotecaSelectionBar
        selected={[item({ id: 'a' }), item({ id: 'b' })]}
        onClear={vi.fn()}
      />,
    )
    expect(screen.getByText('2 seleccionados')).toBeInTheDocument()
  })

  it('habilita "Enviar a Imprenta" solo si hay ≥1 item ingerible', () => {
    const onSendToImprenta = vi.fn()
    const { rerender } = renderWithProviders(
      <BibliotecaSelectionBar
        // Solo un Office (no ingerible) → deshabilitado.
        selected={[
          item({
            fileType: 'document',
            mimeType: 'application/msword',
            title: 'carta.doc',
          }),
        ]}
        onClear={vi.fn()}
        onSendToImprenta={onSendToImprenta}
      />,
    )
    expect(screen.getByRole('button', { name: /Enviar a Imprenta/i })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // Una imagen entre la selección → habilitado.
    rerender(
      <BibliotecaSelectionBar
        selected={[item()]}
        onClear={vi.fn()}
        onSendToImprenta={onSendToImprenta}
      />,
    )
    expect(screen.getByRole('button', { name: /Enviar a Imprenta/i })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
  })

  it('"Enviar a Imprenta" baja blobs ingeribles y los entrega como File', async () => {
    const onSendToImprenta = vi.fn()
    const onClear = vi.fn()
    renderWithProviders(
      <BibliotecaSelectionBar
        selected={[
          item({ id: 'img', itemId: 'img', title: 'foto.png' }),
          // Office se ignora (no ingerible).
          item({
            id: 'doc',
            itemId: 'doc',
            fileType: 'document',
            mimeType: 'application/msword',
            title: 'carta.doc',
          }),
        ]}
        onClear={onClear}
        onSendToImprenta={onSendToImprenta}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Enviar a Imprenta/i }))
    await waitFor(() => expect(onSendToImprenta).toHaveBeenCalledTimes(1))
    const files = onSendToImprenta.mock.calls[0]![0] as File[]
    expect(files).toHaveLength(1)
    expect(files[0]!.name).toBe('foto.png')
    expect(requestMocks.requestBlob).toHaveBeenCalledTimes(1)
    expect(onClear).toHaveBeenCalled()
  })

  it('Eliminar hace soft-delete de cada uno y ofrece un único Deshacer que restaura todos', async () => {
    const onClear = vi.fn()
    renderWithProviders(
      <>
        <BibliotecaSelectionBar
          selected={[
            item({ id: 'notas-attachment:a', kind: 'notas-attachment', itemId: 'a' }),
            item({ id: 'recorte-image:b', kind: 'recorte-image', itemId: 'b' }),
          ]}
          onClear={onClear}
        />
        {/* El ToastHost renderiza el toast real (con su botón Deshacer); el
            ToastProvider solo provee contexto, no UI. */}
        <ToastHost />
      </>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Eliminar/i }))

    await waitFor(() => expect(apiMocks.setDeleted).toHaveBeenCalledTimes(2))
    expect(apiMocks.setDeleted).toHaveBeenCalledWith('notas-attachment', 'a', true)
    expect(apiMocks.setDeleted).toHaveBeenCalledWith('recorte-image', 'b', true)
    await waitFor(() => expect(onClear).toHaveBeenCalled())

    // Un solo toast con el conteo + Deshacer.
    const undo = await screen.findByRole('button', { name: 'Deshacer' })
    expect(screen.getByText('2 archivos eliminados')).toBeInTheDocument()

    apiMocks.setDeleted.mockClear()
    await userEvent.click(undo)
    await waitFor(() => expect(apiMocks.setDeleted).toHaveBeenCalledTimes(2))
    expect(apiMocks.setDeleted).toHaveBeenCalledWith('notas-attachment', 'a', false)
    expect(apiMocks.setDeleted).toHaveBeenCalledWith('recorte-image', 'b', false)
  })
})
