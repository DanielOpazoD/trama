/**
 * DD8: tests del RescueOrphansPanel (DD1).
 *
 * Cubre los 3 estados visibles:
 *   - cargando → mensaje sutil
 *   - 0 huérfanos → mensaje de "todo referenciado"
 *   - N huérfanos → grid de thumbnails + acciones
 *
 * Y los flujos clave:
 *   - click en "recuperar" llama al endpoint y quita el item de la lista
 *   - error en api.listOrphanedBlobs muestra "reintentar"
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderWithProviders } from '../../test-utils'
import { RescueOrphansPanel } from './RescueOrphansPanel'
import * as apiModule from '../../api'

beforeEach(() => {
  vi.restoreAllMocks()
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('RescueOrphansPanel', () => {
  it('muestra mensaje cuando no hay huérfanos', async () => {
    vi.spyOn(apiModule.api, 'listOrphanedBlobs').mockResolvedValue({
      orphans: [],
      totalInStore: 0,
      referenced: 0,
    })
    renderWithProviders(<RescueOrphansPanel />)
    await waitFor(() => {
      expect(screen.getByText(/no hay fotos huérfanas/i)).toBeInTheDocument()
    })
  })

  it('renderiza thumbnails para cada huérfano + botones de recuperar', async () => {
    vi.spyOn(apiModule.api, 'listOrphanedBlobs').mockResolvedValue({
      orphans: ['abc.jpg', 'def.png'],
      totalInStore: 2,
      referenced: 0,
    })
    renderWithProviders(<RescueOrphansPanel />)
    await waitFor(() => {
      expect(screen.getByText(/recuperar todas \(2\)/i)).toBeInTheDocument()
    })
    expect(screen.getAllByRole('img')).toHaveLength(2)
    // src apunta a /api/momentos-file/:key
    const imgs = screen.getAllByRole('img') as HTMLImageElement[]
    expect(imgs[0]!.src).toContain('/api/momentos-file/abc.jpg')
    expect(imgs[1]!.src).toContain('/api/momentos-file/def.png')
  })

  it('al recuperar un blob, lo quita de la lista', async () => {
    vi.spyOn(apiModule.api, 'listOrphanedBlobs').mockResolvedValue({
      orphans: ['abc.jpg', 'def.png'],
      totalInStore: 2,
      referenced: 0,
    })
    const rescueSpy = vi
      .spyOn(apiModule.api, 'rescueOrphanedBlob')
      .mockResolvedValue({
        id: 'm1',
        kind: 'foto',
        capturedAt: '2026-05-25T10:00:00Z',
        payload: { storageKey: 'abc.jpg' },
        origin: { kind: 'imported' },
        entityIds: [],
        createdAt: '2026-05-25T10:00:00Z',
        updatedAt: '2026-05-25T10:00:00Z',
      })
    renderWithProviders(<RescueOrphansPanel />)

    await waitFor(() => {
      expect(screen.getAllByRole('img')).toHaveLength(2)
    })

    fireEvent.click(
      screen.getByRole('button', { name: /recuperar foto abc.jpg/i }),
    )

    await waitFor(() => {
      expect(rescueSpy).toHaveBeenCalledWith({ storageKey: 'abc.jpg' })
      // Tras recuperar, solo queda una foto.
      expect(screen.getAllByRole('img')).toHaveLength(1)
    })
  })

  it('si la API falla, muestra reintentar', async () => {
    vi.spyOn(apiModule.api, 'listOrphanedBlobs').mockRejectedValue(
      new Error('boom'),
    )
    renderWithProviders(<RescueOrphansPanel />)
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
    })
  })
})
