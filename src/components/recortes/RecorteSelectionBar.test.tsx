import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Recorte } from '../../api'
import { renderWithProviders } from '../../test-utils'
import { RecorteSelectionBar } from './RecorteSelectionBar'

const apiMocks = vi.hoisted(() => ({
  updateRecorte: vi.fn(),
  removeRecorte: vi.fn(),
  restoreRecorte: vi.fn(),
  promoteRecorte: vi.fn(),
}))
vi.mock('../../api', () => ({ api: apiMocks }))

function recorte(over: Partial<Recorte> = {}): Recorte {
  return {
    id: 'r1',
    text: 'apunte',
    sourceUrl: null,
    sourceTitle: null,
    sourceAuthor: null,
    note: null,
    imageUrl: null,
    imageKey: null,
    images: [],
    captureMode: 'citation',
    status: 'pending',
    promotedTarget: null,
    promotedId: null,
    captureSource: null,
    capturedAt: '2026-06-14T12:00:00.000Z',
    createdAt: '2026-06-14T12:00:00.000Z',
    updatedAt: '2026-06-14T12:00:00.000Z',
    ...over,
  }
}

describe('<RecorteSelectionBar />', () => {
  beforeEach(() => {
    apiMocks.updateRecorte.mockResolvedValue({})
    apiMocks.removeRecorte.mockResolvedValue({ deletedAt: '2026-06-14T13:00:00.000Z' })
    apiMocks.restoreRecorte.mockResolvedValue(undefined)
    apiMocks.promoteRecorte.mockResolvedValue({})
  })

  it('archivar llama updateRecorte(status:archived) por cada seleccionada', async () => {
    const onDone = vi.fn()
    renderWithProviders(
      <RecorteSelectionBar
        selected={[recorte({ id: 'a' }), recorte({ id: 'b' })]}
        onClear={vi.fn()}
        onDone={onDone}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /archivar/i }))
    await waitFor(() => expect(apiMocks.updateRecorte).toHaveBeenCalledTimes(2))
    expect(apiMocks.updateRecorte).toHaveBeenCalledWith('a', { status: 'archived' })
    expect(apiMocks.updateRecorte).toHaveBeenCalledWith('b', { status: 'archived' })
    expect(onDone).toHaveBeenCalled()
  })

  it('eliminar borra cada seleccionada (soft-delete por el endpoint)', async () => {
    const onDone = vi.fn()
    renderWithProviders(
      <RecorteSelectionBar
        selected={[recorte({ id: 'a' }), recorte({ id: 'b' })]}
        onClear={vi.fn()}
        onDone={onDone}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /eliminar/i }))
    await waitFor(() => expect(apiMocks.removeRecorte).toHaveBeenCalledTimes(2))
    expect(apiMocks.removeRecorte).toHaveBeenCalledWith('a')
    expect(apiMocks.removeRecorte).toHaveBeenCalledWith('b')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })

  it('→ Momento promueve cada una: foto si tiene imagen, recorte si es texto', async () => {
    renderWithProviders(
      <RecorteSelectionBar
        selected={[
          recorte({ id: 'img', imageKey: 'u/x.webp', text: 'mi gato' }),
          recorte({ id: 'txt', text: 'una frase' }),
        ]}
        onClear={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /momento/i }))
    await waitFor(() => expect(apiMocks.promoteRecorte).toHaveBeenCalledTimes(2))
    const calls = Object.fromEntries(
      apiMocks.promoteRecorte.mock.calls.map((c) => [c[0], c[1]]),
    )
    expect(calls.img.momento.kind).toBe('foto')
    expect(calls.img.momento.payload.caption).toBe('mi gato')
    expect(calls.txt.momento.kind).toBe('recorte')
  })

  it('"A pendientes" solo aparece si hay alguna archivada', () => {
    const { rerender } = renderWithProviders(
      <RecorteSelectionBar
        selected={[recorte({ status: 'pending' })]}
        onClear={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(
      screen.queryByRole('button', { name: /a pendientes/i }),
    ).not.toBeInTheDocument()
    rerender(
      <RecorteSelectionBar
        selected={[recorte({ id: 'z', status: 'archived' })]}
        onClear={vi.fn()}
        onDone={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /a pendientes/i })).toBeInTheDocument()
  })

  it('ofrece enviar imágenes seleccionadas a Imprenta', async () => {
    const onSendImagesToPdf = vi.fn()
    const onDone = vi.fn()
    renderWithProviders(
      <RecorteSelectionBar
        selected={[
          recorte({
            id: 'img',
            imageKey: 'u/x.webp',
            images: [{ storageKey: 'u/x.webp' }],
          }),
          recorte({ id: 'txt', text: 'solo texto' }),
        ]}
        onClear={vi.fn()}
        onDone={onDone}
        onSendImagesToPdf={onSendImagesToPdf}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /imprenta/i }))

    expect(onSendImagesToPdf).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'img' }),
    ])
    expect(onDone).toHaveBeenCalled()
  })
})
